import { ConflictException, Injectable, UnauthorizedException, BadRequestException, ServiceUnavailableException } from '@nestjs/common';
import { OAuth2Client } from 'google-auth-library';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Role, User } from '@prisma/client';
import * as argon2 from 'argon2';
import { createHash, randomBytes } from 'crypto';
import { MailService, PrismaService } from '../common/infra.module';
import { resetPasswordMail, welcomeMail } from '../common/mail-templates';
import { avatarSrc } from '../common/avatar';
import { GoogleDto, LoginDto, RegisterDto } from './dto';

/** Bump when the Terms or Privacy Policy change in a way users must accept again. Shown on the legal pages too. */
export const TERMS_VERSION = '2026-10-30';

const sha256 = (s: string) => createHash('sha256').update(s).digest('hex');

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwt: JwtService,
    private config: ConfigService,
    private mail: MailService,
  ) {}

  async register(dto: RegisterDto) {
    const email = dto.email.toLowerCase();
    if (await this.prisma.user.findUnique({ where: { email } })) throw new ConflictException('An account with this email already exists');
    const isParent = dto.accountType === 'PARENT';
    const user = await this.prisma.user.create({
      data: {
        email,
        name: dto.name,
        phone: dto.phone,
        role: isParent ? Role.PARENT : Role.STUDENT,
        track: isParent ? null : dto.track,
        passwordHash: await argon2.hash(dto.password),
        termsAcceptedAt: new Date(),
        termsVersion: TERMS_VERSION,
      },
    });
    void this.mail.sendTemplate(user.email, welcomeMail(user.name, `${this.config.get('FRONTEND_URL')}/dashboard`));
    return this.issue(user);
  }

  async login(dto: LoginDto) {
    const user = await this.prisma.user.findUnique({ where: { email: dto.email.toLowerCase() } });
    if (!user || !(await argon2.verify(user.passwordHash, dto.password))) throw new UnauthorizedException('Wrong email or password');
    return this.issue(user);
  }

  /**
   * Sign in or sign up with a Google ID token. The token is verified against GOOGLE_CLIENT_ID.
   * Unknown email + no accountType => { needsProfile: true } so the UI can ask student/parent and track.
   */
  async google(dto: GoogleDto) {
    const clientId = this.config.get<string>('GOOGLE_CLIENT_ID');
    if (!clientId) throw new ServiceUnavailableException('Google sign-in is not configured yet');
    let payload;
    try {
      const ticket = await new OAuth2Client().verifyIdToken({ idToken: dto.credential, audience: clientId.split(',').map((c) => c.trim()).filter(Boolean) });
      payload = ticket.getPayload();
    } catch {
      throw new UnauthorizedException('Google sign-in failed. Please try again');
    }
    if (!payload?.sub || !payload.email || !payload.email_verified) throw new UnauthorizedException('Your Google email is not verified');
    const email = payload.email.toLowerCase();

    let user = await this.prisma.user.findFirst({ where: { OR: [{ googleId: payload.sub }, { email }] } });
    if (user) {
      // Google verified this email, so it is safe to link an existing email/password account
      if (!user.googleId) user = await this.prisma.user.update({ where: { id: user.id }, data: { googleId: payload.sub, avatarUrl: payload.picture } });
      return { needsProfile: false as const, ...(await this.issue(user)) };
    }
    if (!dto.accountType) return { needsProfile: true as const, name: payload.name ?? '', email };
    if (dto.acceptTerms !== true) throw new BadRequestException('Please accept the Terms and Privacy Policy to create an account');

    const isParent = dto.accountType === 'PARENT';
    user = await this.prisma.user.create({
      data: {
        email,
        name: payload.name ?? email.split('@')[0],
        googleId: payload.sub,
        avatarUrl: payload.picture,
        role: isParent ? Role.PARENT : Role.STUDENT,
        track: isParent ? null : dto.track,
        // Google-only accounts get an unusable random password; they can set one via "Forgot password"
        passwordHash: await argon2.hash(randomBytes(32).toString('hex')),
        termsAcceptedAt: new Date(),
        termsVersion: TERMS_VERSION,
      },
    });
    void this.mail.sendTemplate(user.email, welcomeMail(user.name, `${this.config.get('FRONTEND_URL')}/dashboard`));
    return { needsProfile: false as const, ...(await this.issue(user)) };
  }

  /** Rotating refresh tokens: each use invalidates the previous one. */
  async refresh(token?: string) {
    if (!token) throw new UnauthorizedException();
    let sub: string;
    try {
      sub = (await this.jwt.verifyAsync(token, { secret: this.config.getOrThrow('JWT_REFRESH_SECRET') })).sub;
    } catch {
      throw new UnauthorizedException();
    }
    const user = await this.prisma.user.findUnique({ where: { id: sub } });
    if (!user?.refreshTokenHash || !(await argon2.verify(user.refreshTokenHash, token))) throw new UnauthorizedException();
    return this.issue(user);
  }

  async logout(token?: string) {
    if (!token) return;
    try {
      const { sub } = await this.jwt.verifyAsync(token, { secret: this.config.getOrThrow('JWT_REFRESH_SECRET') });
      await this.prisma.user.update({ where: { id: sub }, data: { refreshTokenHash: null } });
    } catch {
      /* already invalid */
    }
  }

  async forgotPassword(email: string) {
    const user = await this.prisma.user.findUnique({ where: { email: email.toLowerCase() } });
    if (!user) return; // don't reveal which emails exist
    const raw = randomBytes(32).toString('hex');
    await this.prisma.user.update({
      where: { id: user.id },
      data: { resetTokenHash: sha256(raw), resetTokenExpires: new Date(Date.now() + 3_600_000) },
    });
    const link = `${this.config.get('FRONTEND_URL')}/reset-password?token=${raw}`;
    await this.mail.sendTemplate(user.email, resetPasswordMail(user.name, link));
  }

  async resetPassword(token: string, password: string) {
    const user = await this.prisma.user.findFirst({ where: { resetTokenHash: sha256(token), resetTokenExpires: { gt: new Date() } } });
    if (!user) throw new BadRequestException('This reset link is invalid or has expired');
    await this.prisma.user.update({
      where: { id: user.id },
      data: { passwordHash: await argon2.hash(password), resetTokenHash: null, resetTokenExpires: null, refreshTokenHash: null },
    });
  }

  async me(id: string) {
    const u = await this.prisma.user.findUniqueOrThrow({
      where: { id },
      select: { id: true, email: true, name: true, phone: true, role: true, track: true, avatarKey: true, avatarUrl: true, children: { select: { id: true, name: true, track: true } } },
    });
    const { avatarKey, avatarUrl, ...rest } = u;
    return { ...rest, avatar: avatarSrc({ id, avatarKey, avatarUrl }) };
  }

  private async issue(user: User) {
    const accessToken = await this.jwt.signAsync(
      { sub: user.id, role: user.role, email: user.email },
      { secret: this.config.getOrThrow('JWT_ACCESS_SECRET'), expiresIn: '15m' },
    );
    const refreshToken = await this.jwt.signAsync(
      { sub: user.id, n: randomBytes(8).toString('hex') },
      { secret: this.config.getOrThrow('JWT_REFRESH_SECRET'), expiresIn: '30d' },
    );
    await this.prisma.user.update({ where: { id: user.id }, data: { refreshTokenHash: await argon2.hash(refreshToken) } });
    return { accessToken, refreshToken, user: { id: user.id, name: user.name, email: user.email, role: user.role, track: user.track } };
  }
}
