import { Body, Controller, Get, HttpCode, Post, Req, Res } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { CookieOptions, Request, Response } from 'express';
import { AuthService } from './auth.service';
import { ForgotPasswordDto, GoogleDto, LoginDto, RegisterDto, ResetPasswordDto } from './dto';
import { AuthUser, CurrentUser, Public } from '../common/decorators';

const base = (): CookieOptions => ({ httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', path: '/' });

function setAuthCookies(res: Response, t: { accessToken: string; refreshToken: string }) {
  res.cookie('access_token', t.accessToken, { ...base(), maxAge: 15 * 60_000 });
  res.cookie('refresh_token', t.refreshToken, { ...base(), maxAge: 30 * 86_400_000 });
}

/** The mobile app has no cookie jar it can rely on: it sends `X-Client: mobile` and keeps the tokens itself. */
const isMobile = (req: Request) => req.headers['x-client'] === 'mobile';
const mobileBody = (r: { user: unknown; accessToken: string; refreshToken: string }) => ({ user: r.user, accessToken: r.accessToken, refreshToken: r.refreshToken });
const refreshFrom = (req: Request): string | undefined =>
  req.cookies?.refresh_token ?? (isMobile(req) && typeof req.body?.refreshToken === 'string' ? req.body.refreshToken : undefined);

@Controller('auth')
export class AuthController {
  constructor(private auth: AuthService) {}

  @Public() @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('register')
  async register(@Body() dto: RegisterDto, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const r = await this.auth.register(dto);
    setAuthCookies(res, r);
    return isMobile(req) ? mobileBody(r) : r.user;
  }

  @Public() @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('login') @HttpCode(200)
  async login(@Body() dto: LoginDto, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const r = await this.auth.login(dto);
    setAuthCookies(res, r);
    return isMobile(req) ? mobileBody(r) : r.user;
  }

  @Public() @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('google') @HttpCode(200)
  async google(@Body() dto: GoogleDto, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const r = await this.auth.google(dto);
    if (r.needsProfile) return r;
    setAuthCookies(res, r);
    return isMobile(req) ? { needsProfile: false, ...mobileBody(r) } : { needsProfile: false, user: r.user };
  }

  @Public()
  @Post('refresh') @HttpCode(200)
  async refresh(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const r = await this.auth.refresh(refreshFrom(req));
    setAuthCookies(res, r);
    return isMobile(req) ? mobileBody(r) : r.user;
  }

  @Public()
  @Post('logout') @HttpCode(204)
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    await this.auth.logout(refreshFrom(req));
    res.clearCookie('access_token', base());
    res.clearCookie('refresh_token', base());
  }

  @Public() @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('forgot-password') @HttpCode(200)
  async forgot(@Body() dto: ForgotPasswordDto) {
    await this.auth.forgotPassword(dto.email);
    return { ok: true };
  }

  @Public()
  @Post('reset-password') @HttpCode(200)
  async reset(@Body() dto: ResetPasswordDto) {
    await this.auth.resetPassword(dto.token, dto.password);
    return { ok: true };
  }

  @Get('me')
  me(@CurrentUser() user: AuthUser) {
    return this.auth.me(user.id);
  }
}
