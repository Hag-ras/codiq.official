import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import type { Request } from 'express';
import { Role } from '@prisma/client';
import { AuthUser } from '../common/decorators';
import { PrismaService } from '../common/infra.module';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(config: ConfigService, private prisma: PrismaService) {
    super({
      jwtFromRequest: ExtractJwt.fromExtractors([
        (req: Request) => req?.cookies?.access_token ?? null,
        ExtractJwt.fromAuthHeaderAsBearerToken(),
      ]),
      secretOrKey: config.getOrThrow<string>('JWT_ACCESS_SECRET'),
    });
  }
  /** A deleted user's still-valid token stops working immediately. */
  async validate(p: { sub: string; role: Role; email: string }): Promise<AuthUser> {
    if (!(await this.prisma.user.findUnique({ where: { id: p.sub }, select: { id: true } }))) throw new UnauthorizedException();
    return { id: p.sub, role: p.role, email: p.email };
  }
}
