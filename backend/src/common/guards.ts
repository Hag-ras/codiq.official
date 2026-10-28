import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthGuard } from '@nestjs/passport';
import { Role } from '@prisma/client';
import { AuthUser, IS_PUBLIC, ROLES } from './decorators';
import { PrismaService } from './infra.module';

/** Every route requires a valid access token unless marked @Public(). */
@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  constructor(private reflector: Reflector) {
    super();
  }
  canActivate(ctx: ExecutionContext) {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, [ctx.getHandler(), ctx.getClass()]);
    return isPublic ? true : super.canActivate(ctx);
  }
}

/**
 * @Roles(...) restricts a route or controller to the listed roles.
 * The role in the JWT can be up to 15 minutes old, so on role-protected routes we re-read the
 * user's current role from the database. A demoted or deleted admin loses access immediately.
 */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private reflector: Reflector, private prisma: PrismaService) {}
  async canActivate(ctx: ExecutionContext) {
    const roles = this.reflector.getAllAndOverride<Role[]>(ROLES, [ctx.getHandler(), ctx.getClass()]);
    if (!roles?.length) return true;
    const req = ctx.switchToHttp().getRequest();
    const user: AuthUser | undefined = req.user;
    if (!user) throw new ForbiddenException('Your role does not allow this');
    const current = await this.prisma.user.findUnique({ where: { id: user.id }, select: { role: true } });
    if (!current || !roles.includes(current.role)) throw new ForbiddenException('Your role does not allow this');
    req.user = { ...user, role: current.role };
    return true;
  }
}
