import { Controller, ForbiddenException, Get, Injectable, Logger, Module, NotFoundException, Param, Query, Res } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Response } from 'express';
import { Role } from '@prisma/client';
import PDFDocument from 'pdfkit';
import { randomBytes } from 'crypto';
import { existsSync } from 'fs';
import { join } from 'path';
import { PrismaService } from '../common/infra.module';
import { AuthUser, CurrentUser, Public, Roles } from '../common/decorators';
import { NotificationsService } from '../notifications/notifications.module';

const LIVE_MIN_SECONDS = 10 * 60;
const INK = '#1c1d21', PAPER = '#f5f3ee', BLUE = '#2b62b3', MUTED = '#6b6a66';
const TRACK_LABEL = { KIDS: 'Codiq Kids', SCHOOL: 'Codiq School', COLLEGE: 'Codiq College' } as const;

/** "CDQ-7K2M-9XQ4": unguessable, and easy to read out over the phone (no 0/O or 1/I). */
function newSerial() {
  const alphabet = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  const pick = (n: number) => Array.from(randomBytes(n), (b) => alphabet[b % alphabet.length]).join('');
  return `CDQ-${pick(4)}-${pick(4)}`;
}

@Injectable()
export class CertificatesService {
  private log = new Logger('Certificates');
  constructor(private prisma: PrismaService, private config: ConfigService, private notify: NotificationsService) {}

  /** A package is finished when every session is done: lessons watched/completed, live classes attended for 10+ minutes. */
  async progressIn(userId: string, packageId: string) {
    const sessions = await this.prisma.session.findMany({
      where: { packageId },
      select: { id: true, progress: { where: { userId }, select: { completed: true } }, attendance: { where: { userId }, select: { attendedSeconds: true } } },
    });
    const done = sessions.filter((s) => s.progress[0]?.completed || (s.attendance[0]?.attendedSeconds ?? 0) >= LIVE_MIN_SECONDS).length;
    return { total: sessions.length, done, eligible: sessions.length > 0 && done === sessions.length };
  }

  /** Issues the certificate the first time a student finishes a package. Returns it (new or existing), or null if not finished. */
  async tryIssue(userId: string, packageId: string) {
    const existing = await this.prisma.certificate.findUnique({ where: { userId_packageId: { userId, packageId } } });
    if (existing) return existing;
    const enrolled = await this.prisma.enrollment.findUnique({ where: { userId_packageId: { userId, packageId } }, select: { id: true } });
    if (!enrolled || !(await this.progressIn(userId, packageId)).eligible) return null;
    for (let i = 0; i < 5; i++) {
      try {
        const cert = await this.prisma.certificate.create({ data: { userId, packageId, serial: newSerial() }, include: { package: { select: { name: true } } } });
        this.log.log(`Certificate ${cert.serial} issued`);
        void this.notify.certificateIssued(userId, packageId, cert.package.name).catch(() => null);
        return cert;
      } catch (e) {
        // A duplicate serial (tiny chance) or two requests racing: look again, else retry with a new serial
        const again = await this.prisma.certificate.findUnique({ where: { userId_packageId: { userId, packageId } } });
        if (again) return again;
        if (i === 4) throw e;
      }
    }
    return null;
  }

  /** One-page landscape PDF with the Codiq wordmark. Student names in Arabic are shaped with DejaVu Sans, which ships in assets/fonts. */
  async render(cert: { serial: string; issuedAt: Date; user: { name: string }; package: { name: string; track: keyof typeof TRACK_LABEL; _count: { sessions: number } } }) {
    const fonts = join(process.cwd(), 'assets', 'fonts');
    const bold = join(fonts, 'DejaVuSans-Bold.ttf'), regular = join(fonts, 'DejaVuSans.ttf');
    const haveFonts = existsSync(bold) && existsSync(regular);
    const doc = new PDFDocument({ size: 'A4', layout: 'landscape', margin: 0, info: { Title: `Codiq certificate ${cert.serial}`, Author: 'Codiq' } });
    const chunks: Buffer[] = [];
    doc.on('data', (c: Buffer) => chunks.push(c));
    const finished = new Promise<Buffer>((resolve) => doc.on('end', () => resolve(Buffer.concat(chunks))));
    const B = haveFonts ? bold : 'Helvetica-Bold', R = haveFonts ? regular : 'Helvetica';
    const W = doc.page.width, H = doc.page.height;
    const rtl = (s: string) => /[֐-ࣿ]/.test(s);
    const centered = (text: string, y: number, font: string, size: number, color: string, opts: PDFKit.Mixins.TextOptions = {}) => {
      doc.font(font).fontSize(size).fillColor(color).text(text, 60, y, { width: W - 120, align: 'center', ...opts });
    };

    doc.rect(0, 0, W, H).fill(PAPER);
    doc.lineWidth(3).strokeColor(BLUE).rect(26, 26, W - 52, H - 52).stroke();
    doc.lineWidth(0.8).strokeColor(INK).rect(34, 34, W - 68, H - 68).stroke();

    // Wordmark: "codiq" in bold monospace and the blue block cursor
    doc.font('Courier-Bold').fontSize(38);
    const wordW = doc.widthOfString('codiq') - 4;
    const startX = (W - (wordW + 18)) / 2;
    doc.fillColor(INK).text('codiq', startX, 72, { lineBreak: false, characterSpacing: -1.5 });
    doc.rect(startX + wordW + 4, 76, 14, 32).fill(BLUE);

    centered('CERTIFICATE OF COMPLETION', 138, B, 13, MUTED, { characterSpacing: 4 });
    centered('This certifies that', 182, R, 14, MUTED);

    let size = 40;
    doc.font(B);
    while (size > 18 && doc.fontSize(size).widthOfString(cert.user.name) > W - 160) size -= 2;
    centered(cert.user.name, 212, B, size, INK, rtl(cert.user.name) ? { features: ['rtla'] } : {});
    doc.lineWidth(1.5).strokeColor(BLUE).moveTo(W / 2 - 110, 272).lineTo(W / 2 + 110, 272).stroke();

    centered('has successfully completed every session of', 292, R, 14, MUTED);
    centered(cert.package.name, 322, B, 24, INK);
    centered(`${TRACK_LABEL[cert.package.track]} track · ${cert.package._count.sessions} sessions`, 362, R, 12, MUTED);

    const date = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Africa/Cairo' }).format(cert.issuedAt);
    const baseY = H - 120;
    doc.lineWidth(0.8).strokeColor(MUTED);
    doc.moveTo(90, baseY).lineTo(270, baseY).stroke();
    doc.moveTo(W - 270, baseY).lineTo(W - 90, baseY).stroke();
    doc.font(B).fontSize(12).fillColor(INK).text(date, 90, baseY + 8, { width: 180, align: 'center' });
    doc.font(R).fontSize(9).fillColor(MUTED).text('Date', 90, baseY + 26, { width: 180, align: 'center' });
    doc.font(B).fontSize(12).fillColor(INK).text('The Codiq team', W - 270, baseY + 8, { width: 180, align: 'center' });
    doc.font(R).fontSize(9).fillColor(MUTED).text('Think it. Code it.', W - 270, baseY + 26, { width: 180, align: 'center' });

    const verify = `${this.config.get('FRONTEND_URL', 'http://localhost:3000')}/verify/${cert.serial}`;
    centered(`Certificate no. ${cert.serial}  ·  Verify at ${verify}`, H - 62, R, 8.5, MUTED);
    doc.end();
    return finished;
  }
}

@Controller('certificates')
class CertificatesController {
  constructor(private certs: CertificatesService, private prisma: PrismaService) {}

  /** Finished and in-progress packages for the signed-in student. Finishing issues the certificate. */
  @Roles(Role.STUDENT)
  @Get()
  async mine(@CurrentUser() u: AuthUser) {
    return this.listFor(u.id);
  }

  @Roles(Role.PARENT)
  @Get('child/:childId')
  async child(@CurrentUser() u: AuthUser, @Param('childId') childId: string) {
    if (!(await this.prisma.user.findFirst({ where: { id: childId, parentId: u.id }, select: { id: true } }))) throw new ForbiddenException();
    return this.listFor(childId);
  }

  private async listFor(userId: string) {
    const enrollments = await this.prisma.enrollment.findMany({ where: { userId, status: 'ACTIVE' }, select: { packageId: true, package: { select: { name: true } } }, orderBy: { createdAt: 'asc' } });
    return Promise.all(
      enrollments.map(async (e) => {
        const p = await this.certs.progressIn(userId, e.packageId);
        const cert = p.eligible ? await this.certs.tryIssue(userId, e.packageId) : await this.prisma.certificate.findUnique({ where: { userId_packageId: { userId, packageId: e.packageId } } });
        return { packageId: e.packageId, name: e.package.name, done: p.done, total: p.total, certificate: cert ? { serial: cert.serial, issuedAt: cert.issuedAt } : null };
      }),
    );
  }

  /** PDF download. A student gets their own; a parent can pass ?studentId= for a linked child. */
  @Roles(Role.STUDENT, Role.PARENT)
  @Get(':packageId/pdf')
  async pdf(@CurrentUser() u: AuthUser, @Param('packageId') packageId: string, @Res() res: Response, @Query('studentId') studentId?: string) {
    let owner = u.id;
    if (u.role === Role.PARENT) {
      if (!studentId || !(await this.prisma.user.findFirst({ where: { id: studentId, parentId: u.id }, select: { id: true } }))) throw new ForbiddenException();
      owner = studentId;
    }
    const issued = await this.certs.tryIssue(owner, packageId);
    if (!issued) throw new NotFoundException('Finish every session of this package to get the certificate');
    const cert = await this.prisma.certificate.findUniqueOrThrow({
      where: { id: issued.id },
      include: { user: { select: { name: true } }, package: { select: { name: true, track: true, _count: { select: { sessions: true } } } } },
    });
    const buf = await this.certs.render(cert);
    res.set({ 'Content-Type': 'application/pdf', 'Content-Length': String(buf.length), 'Content-Disposition': `attachment; filename="codiq-certificate-${cert.serial}.pdf"`, 'Cache-Control': 'private, no-store' });
    res.end(buf);
  }

  /** Anyone holding a certificate number can check that it is real. */
  @Public()
  @Get('verify/:serial')
  async verify(@Param('serial') serial: string) {
    const c = await this.prisma.certificate.findUnique({ where: { serial: serial.toUpperCase() }, select: { issuedAt: true, user: { select: { name: true } }, package: { select: { name: true } } } });
    if (!c) return { valid: false as const };
    return { valid: true as const, name: c.user.name, course: c.package.name, issuedAt: c.issuedAt };
  }
}

@Module({ controllers: [CertificatesController], providers: [CertificatesService], exports: [CertificatesService] })
export class CertificatesModule {}
