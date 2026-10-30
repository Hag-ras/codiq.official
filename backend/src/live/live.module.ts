import { BadRequestException, Body, Controller, ForbiddenException, Get, HttpCode, Logger, Module, Param, Post, Query, Req } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request } from 'express';
import { AccessToken, EgressClient, EncodedFileOutput, RoomServiceClient, S3Upload, TrackSource, WebhookReceiver } from 'livekit-server-sdk';
import { IsBoolean, IsIn, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import { Role } from '@prisma/client';
import { AccessService, activeEnrollment, PrismaService } from '../common/infra.module';
import { AuthUser, CurrentUser, Public, Roles } from '../common/decorators';

class HeartbeatDto {
  /** The class tab is visible and focused */
  @IsBoolean() active!: boolean;
  @IsBoolean() cam!: boolean;
  @IsBoolean() mic!: boolean;
  /** Chat messages, hands, board strokes and code runs since the last heartbeat */
  @IsInt() @Min(0) @Max(30) interactions!: number;
}

const MODERATIONS = ['mute', 'camera-off', 'stop-share', 'remove', 'cohost', 'uncohost', 'mute-all'] as const;
class ModerateDto {
  @IsIn(MODERATIONS) action!: (typeof MODERATIONS)[number];
  /** The person's user id (their LiveKit identity). Not needed for mute-all. */
  @IsOptional() @IsString() userId?: string;
}

/**
 * Engagement score (0-100): attention 60% (class tab in focus), camera 15%, microphone 10% (a quarter of the
 * class talking counts as full), participation 15% (5 chats, hands, strokes or code runs count as full).
 * Everything is measured against the length of the class, so joining late or leaving early lowers it.
 */
export function engagement(r: { activeSeconds: number; camSeconds: number; micSeconds: number; interactions: number }, classSeconds: number) {
  const c = Math.max(classSeconds, 60);
  const score = 0.6 * Math.min(1, r.activeSeconds / c) + 0.15 * Math.min(1, r.camSeconds / c) + 0.1 * Math.min(1, r.micSeconds / (0.25 * c)) + 0.15 * Math.min(1, r.interactions / 5);
  return Math.round(score * 100);
}

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
  async token(@CurrentUser() u: AuthUser, @Param('sessionId') sessionId: string, @Query('monitor') monitorFlag?: string) {
    const s = await this.access.assertSessionAccess(u, sessionId);
    if (s.type !== 'LIVE') throw new BadRequestException('This is a recorded session');
    if (u.role === Role.PARENT) throw new BadRequestException('Parents can follow progress but not join classes');
    const me = await this.prisma.user.findUniqueOrThrow({ where: { id: u.id }, select: { name: true } });
    const att = await this.prisma.liveAttendance.findUnique({ where: { sessionId_userId: { sessionId, userId: u.id } }, select: { removedAt: true, cohost: true } });
    if (att?.removedAt && u.role !== Role.ADMIN && u.role !== Role.INSTRUCTOR) throw new ForbiddenException('The host removed you from this class');
    const cohost = !!att?.cohost;
    // Only admins may watch quietly: hidden from the participant list, no camera, mic or chat.
    const monitor = monitorFlag === '1' && u.role === Role.ADMIN;
    const hostRole = u.role === Role.INSTRUCTOR || u.role === Role.ADMIN;
    const ended = await this.prisma.session.findUniqueOrThrow({ where: { id: sessionId }, select: { endedAt: true } });
    if (ended.endedAt && !hostRole) throw new ForbiddenException('The host ended this class');
    if (ended.endedAt && hostRole && !monitorFlag) await this.prisma.session.update({ where: { id: sessionId }, data: { endedAt: null } }); // a host coming back reopens it
    const isHost = !monitor && (u.role === Role.INSTRUCTOR || u.role === Role.ADMIN);

    const at = new AccessToken(...this.creds(), { identity: u.id, name: me.name, ttl: '4h', metadata: JSON.stringify({ role: u.role, cohost }) });
    at.addGrant(monitor
      ? { room: sessionId, roomJoin: true, canSubscribe: true, canPublish: false, canPublishData: false, hidden: true }
      : { room: sessionId, roomJoin: true, canSubscribe: true, canPublish: true, canPublishData: true, canUpdateOwnMetadata: true, roomAdmin: isHost, roomRecord: isHost });

    if (u.role === Role.STUDENT) {
      await this.prisma.sessionProgress.upsert({
        where: { userId_sessionId: { userId: u.id, sessionId } },
        create: { userId: u.id, sessionId, attendedLive: true },
        update: { attendedLive: true },
      });
    }
    return { token: await at.toJwt(), url: this.config.getOrThrow('LIVEKIT_URL'), isHost, monitor, cohost };
  }

  /** Called every ~30 seconds by each person in the class. The server measures the time itself, so a client cannot claim more than it was there. */
  @Post(':sessionId/heartbeat') @HttpCode(204)
  async heartbeat(@CurrentUser() u: AuthUser, @Param('sessionId') sessionId: string, @Body() dto: HeartbeatDto) {
    const s = await this.access.assertSessionAccess(u, sessionId);
    if (s.type !== 'LIVE' || u.role === Role.PARENT) return;
    const now = new Date();
    const key = { sessionId_userId: { sessionId, userId: u.id } };
    const row = await this.prisma.liveAttendance.findUnique({ where: key });
    if (!row) {
      await this.prisma.liveAttendance.create({ data: { sessionId, userId: u.id, firstJoinAt: now, lastSeenAt: now, interactions: dto.interactions } });
      return;
    }
    const gap = (now.getTime() - row.lastSeenAt.getTime()) / 1000;
    const continued = gap <= 90; // a longer silence means they left and came back
    const d = continued ? Math.min(Math.round(gap), 45) : 0;
    await this.prisma.liveAttendance.update({
      where: key,
      data: {
        lastSeenAt: now, ...(continued ? {} : { joins: { increment: 1 } }), interactions: { increment: dto.interactions },
        attendedSeconds: { increment: d }, activeSeconds: { increment: dto.active ? d : 0 },
        camSeconds: { increment: dto.cam ? d : 0 }, micSeconds: { increment: dto.mic ? d : 0 },
      },
    });
  }

  /** Attendance and engagement for every person in a live class, plus enrolled students who never came. */
  @Roles(Role.ADMIN, Role.ASSISTANT, Role.INSTRUCTOR)
  @Get(':sessionId/report')
  async report(@CurrentUser() u: AuthUser, @Param('sessionId') sessionId: string) {
    await this.access.assertSessionAccess(u, sessionId);
    const session = await this.prisma.session.findUniqueOrThrow({ where: { id: sessionId }, select: { title: true, startsAt: true, durationMin: true, packageId: true } });
    const rows = await this.prisma.liveAttendance.findMany({ where: { sessionId }, include: { user: { select: { name: true, role: true } } } });
    const enrolled = await this.prisma.enrollment.findMany({ where: activeEnrollment(session.packageId), include: { user: { select: { id: true, name: true, role: true } } } });
    const start = rows.length ? Math.min(...rows.map((r) => r.firstJoinAt.getTime())) : 0;
    const end = rows.length ? Math.max(...rows.map((r) => r.lastSeenAt.getTime())) : 0;
    const classSeconds = rows.length ? Math.max(60, Math.round((end - start) / 1000)) : 0;
    const people = rows.map((r) => ({
      userId: r.userId, name: r.user.name, role: r.user.role, present: true,
      firstJoinAt: r.firstJoinAt, lastSeenAt: r.lastSeenAt, joins: r.joins,
      attendedSeconds: r.attendedSeconds, activeSeconds: r.activeSeconds, camSeconds: r.camSeconds, micSeconds: r.micSeconds, interactions: r.interactions,
      attendancePct: classSeconds ? Math.min(100, Math.round((r.attendedSeconds / classSeconds) * 100)) : 0,
      engagementPct: engagement(r, classSeconds),
    }));
    const seen = new Set(rows.map((r) => r.userId));
    const absent = enrolled.filter((e) => !seen.has(e.userId)).map((e) => ({
      userId: e.userId, name: e.user.name, role: e.user.role, present: false, firstJoinAt: null, lastSeenAt: null, joins: 0,
      attendedSeconds: 0, activeSeconds: 0, camSeconds: 0, micSeconds: 0, interactions: 0, attendancePct: 0, engagementPct: 0,
    }));
    return { session: { title: session.title, startsAt: session.startsAt, durationMin: session.durationMin }, classStart: rows.length ? new Date(start) : null, classEnd: rows.length ? new Date(end) : null, classSeconds, people: [...people, ...absent] };
  }

  /**
   * Host controls. Hosts (instructor or admin) can do everything, co-hosts can mute, stop cameras and remove
   * ordinary participants. Nobody can act on a host. Anyone asked to unmute still has to agree in their browser.
   */
  @Post(':sessionId/moderate') @HttpCode(200)
  async moderate(@CurrentUser() u: AuthUser, @Param('sessionId') sessionId: string, @Body() dto: ModerateDto) {
    await this.access.assertSessionAccess(u, sessionId);
    const trueHost = u.role === Role.INSTRUCTOR || u.role === Role.ADMIN;
    if (!trueHost) {
      const me = await this.prisma.liveAttendance.findUnique({ where: { sessionId_userId: { sessionId, userId: u.id } }, select: { cohost: true } });
      if (!me?.cohost) throw new ForbiddenException('Only the host and co-hosts can do this');
    }
    if ((dto.action === 'cohost' || dto.action === 'uncohost') && !trueHost) throw new ForbiddenException('Only the host can make co-hosts');
    const rooms = new RoomServiceClient(this.config.getOrThrow('LIVEKIT_HTTP_URL'), ...this.creds());

    const muteTracks = async (identity: string, sources: TrackSource[]) => {
      const info = await rooms.getParticipant(sessionId, identity).catch(() => null);
      if (!info) throw new BadRequestException('That person is not in the class right now');
      for (const t of info.tracks) if (sources.includes(t.source) && !t.muted) await rooms.mutePublishedTrack(sessionId, identity, t.sid, true);
    };
    const isHostUser = async (id: string) => {
      const t = await this.prisma.user.findUnique({ where: { id }, select: { role: true } });
      return t?.role === Role.INSTRUCTOR || t?.role === Role.ADMIN;
    };

    if (dto.action === 'mute-all') {
      for (const p of await rooms.listParticipants(sessionId)) {
        if (p.identity === u.id || (await isHostUser(p.identity))) continue;
        const cohost = (() => { try { return !!JSON.parse(p.metadata || '{}').cohost; } catch { return false; } })();
        if (cohost && !trueHost) continue;
        await muteTracks(p.identity, [TrackSource.MICROPHONE]).catch(() => null);
      }
      return { ok: true };
    }

    if (!dto.userId) throw new BadRequestException('Choose a person');
    if (dto.userId === u.id) throw new BadRequestException('You cannot do that to yourself');
    if (await isHostUser(dto.userId)) throw new ForbiddenException('You cannot moderate the host');
    const key = { sessionId_userId: { sessionId, userId: dto.userId } };

    if (dto.action === 'mute') await muteTracks(dto.userId, [TrackSource.MICROPHONE]);
    else if (dto.action === 'camera-off') await muteTracks(dto.userId, [TrackSource.CAMERA]);
    else if (dto.action === 'stop-share') await muteTracks(dto.userId, [TrackSource.SCREEN_SHARE, TrackSource.SCREEN_SHARE_AUDIO]);
    else if (dto.action === 'remove') {
      await this.prisma.liveAttendance.upsert({ where: key, create: { sessionId, userId: dto.userId, removedAt: new Date(), cohost: false }, update: { removedAt: new Date(), cohost: false } });
      await rooms.removeParticipant(sessionId, dto.userId).catch(() => null); // already gone is fine
    } else {
      const on = dto.action === 'cohost';
      const target = await this.prisma.user.findUnique({ where: { id: dto.userId }, select: { role: true } });
      if (!target || target.role === Role.PARENT) throw new BadRequestException('This person cannot be a co-host');
      await this.prisma.liveAttendance.upsert({ where: key, create: { sessionId, userId: dto.userId, cohost: on }, update: { cohost: on, removedAt: null } });
      await rooms.updateParticipant(sessionId, dto.userId, { metadata: JSON.stringify({ role: target.role, cohost: on }) }).catch(() => null); // not in the room yet: applies when they join
    }
    return { ok: true };
  }

  /** Ends the class for everyone: the room is closed, a recording in progress stops, and only a host can come back in. */
  @Post(':sessionId/end') @HttpCode(200)
  async end(@CurrentUser() u: AuthUser, @Param('sessionId') sessionId: string) {
    await this.access.assertSessionAccess(u, sessionId);
    if (u.role !== Role.INSTRUCTOR && u.role !== Role.ADMIN) {
      const me = await this.prisma.liveAttendance.findUnique({ where: { sessionId_userId: { sessionId, userId: u.id } }, select: { cohost: true } });
      if (!me?.cohost) throw new ForbiddenException('Only the host and co-hosts can end the class');
    }
    await this.prisma.session.update({ where: { id: sessionId }, data: { endedAt: new Date() } });
    const rooms = new RoomServiceClient(this.config.getOrThrow('LIVEKIT_HTTP_URL'), ...this.creds());
    await rooms.deleteRoom(sessionId).catch(() => null); // nobody in the room is fine
    return { ok: true };
  }

  /** Records the room to S3. When egress finishes, the webhook below attaches the file as the session recording. */
  @Post(':sessionId/recording/start') @HttpCode(200)
  async startRecording(@CurrentUser() u: AuthUser, @Param('sessionId') sessionId: string) {
    await this.access.assertSessionAccess(u, sessionId);
    if (u.role !== Role.INSTRUCTOR && u.role !== Role.ADMIN) {
      const me = await this.prisma.liveAttendance.findUnique({ where: { sessionId_userId: { sessionId, userId: u.id } }, select: { cohost: true } });
      if (!me?.cohost) throw new ForbiddenException('Only the host and co-hosts can record');
    }
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
