import { BadRequestException, Controller, Get, HttpCode, Logger, Module, Param, Post, Req } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request } from 'express';
import { AccessToken, EgressClient, EncodedFileOutput, S3Upload, WebhookReceiver } from 'livekit-server-sdk';
import { Role } from '@prisma/client';
import { AccessService, PrismaService } from '../common/infra.module';
import { AuthUser, CurrentUser, Public, Roles } from '../common/decorators';

/**
 * Built-in classroom on LiveKit. The LiveKit room name is the session id.
 * Video, audio, screen share and chat come from LiveKit; "raise hand" uses participant attributes.
 */
@Controller('live')
class LiveController {
  private log = new Logger('Live');
  constructor(private prisma: PrismaService, private access: AccessService, private config: ConfigService) {}

  private creds() {
    return [this.config.getOrThrow<string>('LIVEKIT_API_KEY'), this.config.getOrThrow<string>('LIVEKIT_API_SECRET')] as const;
  }

  @Get(':sessionId/token')
  async token(@CurrentUser() u: AuthUser, @Param('sessionId') sessionId: string) {
    const s = await this.access.assertSessionAccess(u, sessionId);
    if (s.type !== 'LIVE') throw new BadRequestException('This is a recorded session');
    if (u.role === Role.PARENT) throw new BadRequestException('Parents can follow progress but not join classes');
    const me = await this.prisma.user.findUniqueOrThrow({ where: { id: u.id }, select: { name: true } });
    const isHost = u.role === Role.INSTRUCTOR || u.role === Role.ADMIN;

    const at = new AccessToken(...this.creds(), { identity: u.id, name: me.name, ttl: '4h', metadata: JSON.stringify({ role: u.role }) });
    at.addGrant({
      room: sessionId, roomJoin: true, canSubscribe: true, canPublish: true, canPublishData: true,
      canUpdateOwnMetadata: true, roomAdmin: isHost, roomRecord: isHost,
    });

    if (u.role === Role.STUDENT) {
      await this.prisma.sessionProgress.upsert({
        where: { userId_sessionId: { userId: u.id, sessionId } },
        create: { userId: u.id, sessionId, attendedLive: true },
        update: { attendedLive: true },
      });
    }
    return { token: await at.toJwt(), url: this.config.getOrThrow('LIVEKIT_URL'), isHost };
  }

  /** Records the room to S3. When egress finishes, the webhook below attaches the file as the session recording. */
  @Roles(Role.INSTRUCTOR, Role.ADMIN)
  @Post(':sessionId/recording/start') @HttpCode(200)
  async startRecording(@CurrentUser() u: AuthUser, @Param('sessionId') sessionId: string) {
    await this.access.assertSessionAccess(u, sessionId);
    const egress = new EgressClient(this.config.getOrThrow('LIVEKIT_HTTP_URL'), ...this.creds());
    const file = new EncodedFileOutput({
      filepath: `recording/${sessionId}/{time}.mp4`,
      output: {
        case: 's3',
        value: new S3Upload({
          accessKey: this.config.getOrThrow('S3_ACCESS_KEY'),
          secret: this.config.getOrThrow('S3_SECRET_KEY'),
          bucket: this.config.getOrThrow('S3_BUCKET'),
          region: this.config.get('S3_REGION', 'us-east-1'),
          endpoint: this.config.get('S3_ENDPOINT'),
          forcePathStyle: true,
        }),
      },
    });
    const info = await egress.startRoomCompositeEgress(sessionId, { file }, { layout: 'speaker' });
    return { egressId: info.egressId };
  }

  @Public()
  @Post('webhook') @HttpCode(200)
  async webhook(@Req() req: Request) {
    const receiver = new WebhookReceiver(...this.creds());
    const event = await receiver.receive((req.body as Buffer).toString(), req.headers.authorization);
    if (event.event === 'egress_ended' && event.egressInfo) {
      const filename = event.egressInfo.fileResults?.[0]?.filename;
      if (filename) {
        await this.prisma.session.update({ where: { id: event.egressInfo.roomName }, data: { videoKey: filename } });
        this.log.log(`Recording saved for ${event.egressInfo.roomName}`);
      }
    }
    return { ok: true };
  }
}

@Module({ controllers: [LiveController] })
export class LiveModule {}
