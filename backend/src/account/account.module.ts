import { BadRequestException, Body, Controller, Delete, ForbiddenException, Get, HttpCode, Module, NotFoundException, Param, Patch, Post, Put, Res } from '@nestjs/common';
import type { Response } from 'express';
import { IsBoolean, IsIn, IsOptional, IsString, Matches, MinLength } from 'class-validator';
import { Role } from '@prisma/client';
import * as argon2 from 'argon2';
import { randomBytes } from 'crypto';
import { activeEnrollment, PrismaService, StorageService } from '../common/infra.module';
import { avatarSrc } from '../common/avatar';
import { AuthUser, CurrentUser, Roles } from '../common/decorators';
import { EG_MOBILE } from '../auth/dto';

class UpdateProfileDto {
  @IsOptional() @IsString() @MinLength(2) name?: string;
  @IsOptional() @Matches(EG_MOBILE, { message: 'Enter an Egyptian mobile number like 01012345678' }) phone?: string;
  @IsOptional() @IsBoolean() emailNotifications?: boolean;
  @IsOptional() @IsIn(['en', 'ar']) language?: 'en' | 'ar';
}
class DeleteAccountDto {
  /** Their password; for an account that signed up with Google, their email address typed out */
  @IsString() confirm!: string;
}
class ChangePasswordDto {
  @IsString() currentPassword!: string;
  @IsString() @MinLength(8) newPassword!: string;
}

class AvatarDto {
  @IsString() key!: string;
}
const MAX_AVATAR_BYTES = 2 * 1024 * 1024;
const profileSelect = { id: true, name: true, email: true, phone: true, role: true, track: true, avatarKey: true, avatarUrl: true, createdAt: true, language: true, emailNotifications: true, termsAcceptedAt: true, guardianConsentAt: true };
const shape = <T extends { id: string; avatarKey: string | null; avatarUrl: string | null }>(u: T) => {
  const { avatarKey, avatarUrl, ...rest } = u;
  return { ...rest, avatar: avatarSrc({ id: u.id, avatarKey, avatarUrl }) };
};

@Controller('account')
class AccountController {
  constructor(private prisma: PrismaService, private storage: StorageService) {}

  @Get('profile')
  async profile(@CurrentUser() u: AuthUser) {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: u.id }, select: { ...profileSelect, googleId: true } });
    const { googleId, ...rest } = user;
    return { ...shape(rest), hasGoogle: !!googleId };
  }

  @Patch('profile')
  async update(@CurrentUser() u: AuthUser, @Body() dto: UpdateProfileDto) {
    return shape(await this.prisma.user.update({ where: { id: u.id }, data: dto, select: profileSelect }));
  }


  /** Everything we hold about the signed-in person, as one JSON file (the "download my data" right). */
  @Get('export')
  async export(@CurrentUser() u: AuthUser, @Res() res: Response) {
    const me = await this.prisma.user.findUniqueOrThrow({
      where: { id: u.id },
      select: {
        id: true, email: true, name: true, phone: true, role: true, track: true, createdAt: true, language: true, emailNotifications: true, termsAcceptedAt: true, termsVersion: true, guardianConsentAt: true,
        parent: { select: { name: true, email: true } },
        children: { select: { name: true, email: true } },
        enrollments: { select: { billing: true, status: true, activeUntil: true, createdAt: true, package: { select: { name: true } } } },
        progress: { select: { watchedSeconds: true, completed: true, updatedAt: true, session: { select: { title: true } } } },
        submissions: { select: { text: true, fileName: true, status: true, score: true, feedback: true, submittedAt: true, gradedAt: true, assignment: { select: { title: true } } } },
        quizAttempts: { select: { score: true, createdAt: true, quiz: { select: { title: true } } } },
        liveAttendance: { select: { firstJoinAt: true, lastSeenAt: true, attendedSeconds: true, activeSeconds: true, camSeconds: true, micSeconds: true, interactions: true, session: { select: { title: true } } } },
        certificates: { select: { serial: true, issuedAt: true, package: { select: { name: true } } } },
        paymentsMade: { select: { amount: true, currency: true, method: true, status: true, billing: true, createdAt: true, paidAt: true, package: { select: { name: true } } } },
        supportThreads: { select: { createdAt: true, status: true, messages: { select: { body: true, fromStaff: true, createdAt: true }, orderBy: { createdAt: 'asc' } } } },
      },
    });
    res.set({ 'Content-Type': 'application/json; charset=utf-8', 'Content-Disposition': 'attachment; filename="codiq-my-data.json"', 'Cache-Control': 'private, no-store' });
    res.send(JSON.stringify({ exportedAt: new Date().toISOString(), ...me }, null, 2));
  }

  /**
   * Deletes the account. Personal data is erased and the person can never log in again.
   * Payment records stay (anonymised through the account) because accounting law requires them.
   * Staff accounts are not self-service: an admin removes those.
   */
  @Post('delete') @HttpCode(200)
  async deleteAccount(@CurrentUser() u: AuthUser, @Body() dto: DeleteAccountDto) {
    if (u.role !== Role.STUDENT && u.role !== Role.PARENT) throw new ForbiddenException('Staff accounts are removed by an admin. Please ask in the chat.');
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: u.id } });
    const passwordOk = await argon2.verify(user.passwordHash, dto.confirm).catch(() => false);
    const emailOk = !!user.googleId && dto.confirm.trim().toLowerCase() === user.email.toLowerCase(); // Google-only accounts have no password to type
    if (!passwordOk && !emailOk) throw new BadRequestException(user.googleId ? 'Type your email address, or your password, to confirm' : 'That password is not right');

    const files = [
      user.avatarKey,
      ...(await this.prisma.submission.findMany({ where: { studentId: u.id, fileKey: { not: null } }, select: { fileKey: true } })).map((s) => s.fileKey),
    ].filter((k): k is string => !!k);

    await this.prisma.$transaction([
      this.prisma.submission.deleteMany({ where: { studentId: u.id } }),
      this.prisma.quizAttempt.deleteMany({ where: { studentId: u.id } }),
      this.prisma.sessionProgress.deleteMany({ where: { userId: u.id } }),
      this.prisma.liveAttendance.deleteMany({ where: { userId: u.id } }),
      this.prisma.certificate.deleteMany({ where: { userId: u.id } }),
      this.prisma.supportThread.deleteMany({ where: { userId: u.id } }),
      this.prisma.parentLinkRequest.deleteMany({ where: { OR: [{ parentId: u.id }, { studentId: u.id }] } }),
      this.prisma.enrollment.deleteMany({ where: { userId: u.id } }),
      this.prisma.user.updateMany({ where: { parentId: u.id }, data: { parentId: null } }), // a deleted parent unlinks their children
      this.prisma.user.update({
        where: { id: u.id },
        data: {
          name: 'Deleted user', email: `deleted-${u.id}@deleted.codiq.invalid`, phone: null, googleId: null, avatarUrl: null, avatarKey: null, parentId: null,
          passwordHash: await argon2.hash(randomBytes(32).toString('hex')), refreshTokenHash: null, resetTokenHash: null, resetTokenExpires: null,
          calendarToken: null, emailNotifications: false, guardianConsentAt: null, deletedAt: new Date(),
        },
      }),
    ]);
    await Promise.all(files.map((k) => this.storage.remove(k)));
    return { ok: true };
  }

  /** Step 2 of the picture upload: the browser already PUT the file to storage using a presigned URL. */
  @Put('avatar')
  async setAvatar(@CurrentUser() u: AuthUser, @Body() dto: AvatarDto) {
    if (!dto.key.startsWith(`avatar/${u.id}/`)) throw new ForbiddenException();
    const head = await this.storage.head(dto.key);
    if (!head) throw new BadRequestException('Upload not found. Please try again');
    if (head.size > MAX_AVATAR_BYTES || !/^image\/(jpeg|png|webp)$/.test(head.contentType)) {
      await this.storage.remove(dto.key);
      throw new BadRequestException('Profile pictures must be a JPEG, PNG or WebP under 2 MB');
    }
    const old = await this.prisma.user.findUniqueOrThrow({ where: { id: u.id }, select: { avatarKey: true } });
    const updated = await this.prisma.user.update({ where: { id: u.id }, data: { avatarKey: dto.key }, select: profileSelect });
    if (old.avatarKey && old.avatarKey !== dto.key) await this.storage.remove(old.avatarKey);
    return shape(updated);
  }

  @Delete('avatar') @HttpCode(200)
  async removeAvatar(@CurrentUser() u: AuthUser) {
    const old = await this.prisma.user.findUniqueOrThrow({ where: { id: u.id }, select: { avatarKey: true } });
    const updated = await this.prisma.user.update({ where: { id: u.id }, data: { avatarKey: null, avatarUrl: null }, select: profileSelect });
    if (old.avatarKey) await this.storage.remove(old.avatarKey);
    return shape(updated);
  }

  @Post('change-password')
  async changePassword(@CurrentUser() u: AuthUser, @Body() dto: ChangePasswordDto) {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: u.id } });
    if (!(await argon2.verify(user.passwordHash, dto.currentPassword))) {
      throw new BadRequestException(
        user.googleId ? 'Current password is wrong. If you signed up with Google, use "Forgot password" to set one' : 'Current password is wrong',
      );
    }
    await this.prisma.user.update({ where: { id: u.id }, data: { passwordHash: await argon2.hash(dto.newPassword), refreshTokenHash: null } });
    return { ok: true, message: 'Password changed. Please log in again on your other devices' };
  }

  /** A student's enrolled packages with progress. */
  @Roles(Role.STUDENT)
  @Get('my-courses')
  async myCourses(@CurrentUser() u: AuthUser) {
    const enrollments = await this.prisma.enrollment.findMany({
      where: { userId: u.id, ...activeEnrollment() },
      include: { package: { include: { sessions: { select: { id: true }, orderBy: { order: 'asc' } } } } },
      orderBy: { createdAt: 'desc' },
    });
    const done = await this.prisma.sessionProgress.findMany({ where: { userId: u.id, completed: true }, select: { sessionId: true } });
    const doneSet = new Set(done.map((d) => d.sessionId));
    return enrollments.map((e) => {
      const total = e.package.sessions.length;
      const completed = e.package.sessions.filter((s) => doneSet.has(s.id)).length;
      return {
        enrollmentId: e.id, packageId: e.packageId, name: e.package.name, track: e.package.track, description: e.package.description,
        billing: e.billing, activeUntil: e.activeUntil, totalSessions: total, completedSessions: completed,
        percent: total ? Math.round((completed / total) * 100) : 0,
      };
    });
  }

  /** Published packages, flagged with whether this user (or one of their children) already has access. */
  @Roles(Role.STUDENT, Role.PARENT)
  @Get('catalog')
  async catalog(@CurrentUser() u: AuthUser) {
    const [packages, mine] = await Promise.all([
      this.prisma.package.findMany({
        where: { isPublished: true },
        include: { _count: { select: { sessions: true } } },
        orderBy: [{ track: 'asc' }, { priceOneTime: 'asc' }],
      }),
      this.prisma.enrollment.findMany({
        where: { ...activeEnrollment(), user: u.role === Role.PARENT ? { parentId: u.id } : { id: u.id } },
        select: { packageId: true },
      }),
    ]);
    const owned = new Set(mine.map((m) => m.packageId));
    return packages.map((p) => ({ ...p, enrolled: owned.has(p.id) }));
  }
}

/** Serves profile pictures: redirects to a short-lived signed storage URL. */
@Controller('avatars')
class AvatarsController {
  constructor(private prisma: PrismaService, private storage: StorageService) {}

  @Get(':userId')
  async one(@CurrentUser() viewer: AuthUser, @Param('userId') userId: string, @Res() res: Response) {
    const target = await this.prisma.user.findUnique({ where: { id: userId }, select: { avatarKey: true, avatarUrl: true, parentId: true } });
    if (!target) throw new NotFoundException();
    // Self, staff, or a parent looking at their own child
    const allowed = viewer.id === userId || viewer.role === Role.ADMIN || viewer.role === Role.INSTRUCTOR || viewer.role === Role.ASSISTANT || target.parentId === viewer.id;
    if (!allowed) throw new ForbiddenException();
    res.setHeader('Cache-Control', 'private, max-age=300');
    if (target.avatarKey) return res.redirect(302, await this.storage.downloadUrl(target.avatarKey));
    if (target.avatarUrl) return res.redirect(302, target.avatarUrl);
    throw new NotFoundException();
  }
}

@Module({ controllers: [AccountController, AvatarsController] })
export class AccountModule {}
