import { ForbiddenException, Global, Injectable, Logger, Module, NotFoundException, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaClient, Role } from '@prisma/client';
import { AuthUser } from './decorators';
import { DeleteObjectCommand, GetObjectCommand, HeadObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit {
  async onModuleInit() {
    await this.$connect();
  }
}

@Injectable()
export class StorageService {
  private s3: S3Client;
  private bucket: string;
  constructor(config: ConfigService) {
    this.bucket = config.getOrThrow('S3_BUCKET');
    this.s3 = new S3Client({
      endpoint: config.get('S3_ENDPOINT'),
      region: config.get('S3_REGION', 'us-east-1'),
      forcePathStyle: true,
      // Newer AWS SDK versions add checksum headers to presigned PUTs, which Cloudflare R2 rejects
      requestChecksumCalculation: 'WHEN_REQUIRED',
      responseChecksumValidation: 'WHEN_REQUIRED',
      credentials: { accessKeyId: config.getOrThrow('S3_ACCESS_KEY'), secretAccessKey: config.getOrThrow('S3_SECRET_KEY') },
    });
  }
  uploadUrl(key: string, contentType: string) {
    return getSignedUrl(this.s3, new PutObjectCommand({ Bucket: this.bucket, Key: key, ContentType: contentType }), { expiresIn: 900 });
  }
  /** Size and type of a stored object, or null if it does not exist. */
  async head(key: string) {
    try {
      const r = await this.s3.send(new HeadObjectCommand({ Bucket: this.bucket, Key: key }));
      return { size: r.ContentLength ?? 0, contentType: r.ContentType ?? '' };
    } catch {
      return null;
    }
  }
  async remove(key: string) {
    await this.s3.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key })).catch(() => null);
  }
  downloadUrl(key: string, fileName?: string) {
    return getSignedUrl(
      this.s3,
      new GetObjectCommand({
        Bucket: this.bucket,
        Key: key,
        ResponseContentDisposition: fileName ? `attachment; filename="${fileName.replace(/"/g, '')}"` : undefined,
      }),
      { expiresIn: 3600 },
    );
  }
}

/**
 * Sends email through Resend (https://resend.com). Without RESEND_API_KEY it only logs the message,
 * which is what you want in local development. Failures are logged and never thrown, so a mail outage
 * can't break signup, password reset or payment confirmation.
 */
@Injectable()
export class MailService {
  private log = new Logger('Mail');
  constructor(private config: ConfigService) {}

  async send(to: string, subject: string, text: string, html?: string): Promise<boolean> {
    const key = this.config.get<string>('RESEND_API_KEY');
    if (!key) {
      this.log.log(`[not sent: RESEND_API_KEY is empty] To ${to} | ${subject}\n${text}`);
      return false;
    }
    try {
      const res = await fetch(`${this.config.get('RESEND_API_URL', 'https://api.resend.com')}/emails`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ from: this.config.get('MAIL_FROM', 'Codiq <onboarding@resend.dev>'), to: [to], subject, text, ...(html ? { html } : {}) }),
        signal: AbortSignal.timeout(10_000),
      });
      if (!res.ok) {
        this.log.error(`Resend rejected the email to ${to}: ${res.status} ${(await res.text()).slice(0, 300)}`);
        return false;
      }
      return true;
    } catch (e) {
      this.log.error(`Could not reach Resend: ${(e as Error).message}`);
      return false;
    }
  }

  sendTemplate(to: string, m: { subject: string; text: string; html: string }) {
    return this.send(to, m.subject, m.text, m.html);
  }
}

export const activeEnrollment = (packageId?: string) => ({
  ...(packageId ? { packageId } : {}),
  status: 'ACTIVE' as const,
  OR: [{ activeUntil: null }, { activeUntil: { gt: new Date() } }],
});

/** Resource-level authorization: who may open a given session's content. */
@Injectable()
export class AccessService {
  constructor(private prisma: PrismaService) {}

  async assertSessionAccess(user: AuthUser, sessionId: string) {
    const s = await this.prisma.session.findUnique({ where: { id: sessionId }, select: { id: true, packageId: true, instructorId: true, type: true } });
    if (!s) throw new NotFoundException('Session not found');
    if (user.role === Role.ADMIN || user.role === Role.ASSISTANT) return s;
    if (user.role === Role.INSTRUCTOR && s.instructorId === user.id) return s;
    if (user.role === Role.STUDENT) {
      const e = await this.prisma.enrollment.findFirst({ where: { userId: user.id, ...activeEnrollment(s.packageId) } });
      if (e) return s;
    }
    if (user.role === Role.PARENT) {
      const child = await this.prisma.user.findFirst({ where: { parentId: user.id, enrollments: { some: activeEnrollment(s.packageId) } } });
      if (child) return s;
    }
    throw new ForbiddenException('You are not enrolled in this package');
  }

  isStaff(user: AuthUser) {
    return user.role === Role.ADMIN || user.role === Role.INSTRUCTOR;
  }
}

@Global()
@Module({ providers: [PrismaService, StorageService, MailService, AccessService], exports: [PrismaService, StorageService, MailService, AccessService] })
export class InfraModule {}
