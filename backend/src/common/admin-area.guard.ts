import { CanActivate, ExecutionContext, ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import { Role } from '@prisma/client';
import { PrismaService } from './infra.module';

/**
 * True when the URL belongs to the admin area: any path segment equal to "admin" (so /api/admin/x,
 * /api/reports/admin/y, /API/Admin/x and /api//admin/x all count). Normalises case, repeated slashes,
 * "." segments and percent-encoding, and treats a URL it can't decode as admin (deny by default).
 */
export function isAdminAreaPath(rawUrl: string): boolean {
  let path = rawUrl.split('?')[0].split('#')[0];
  try {
    path = decodeURIComponent(path);
  } catch {
    return true;
  }
  return path.toLowerCase().split('/').filter((s) => s && s !== '.').includes('admin');
}

/**
 * Safety net: EVERY route under an "admin" path requires an admin, even if a developer forgets
 * @Roles(ADMIN) or marks it @Public(). The role is read from the database, not from the token.
 * Runs after JwtAuthGuard, so a @Public() admin route arrives here without a user and gets 401.
 */
@Injectable()
export class AdminAreaGuard implements CanActivate {
  constructor(private prisma: PrismaService) {}

  async canActivate(ctx: ExecutionContext) {
    const req = ctx.switchToHttp().getRequest();
    if (!isAdminAreaPath(req.originalUrl ?? req.url ?? '')) return true;
    if (!req.user) throw new UnauthorizedException();
    const current = await this.prisma.user.findUnique({ where: { id: req.user.id }, select: { role: true } });
    if (current?.role !== Role.ADMIN) throw new ForbiddenException('Admins only');
    req.user = { ...req.user, role: current.role };
    return true;
  }
}
