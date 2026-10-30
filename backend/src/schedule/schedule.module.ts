import { BadRequestException, Controller, Get, Module, Query } from '@nestjs/common';
import { Prisma, Role } from '@prisma/client';
import { activeEnrollment, PrismaService } from '../common/infra.module';
import { AuthUser, CurrentUser } from '../common/decorators';

const MAX_RANGE_MS = 62 * 86_400_000;

/** Live classes in a date range, for the calendar. Each role sees the classes it can actually open. */
@Controller('schedule')
class ScheduleController {
  constructor(private prisma: PrismaService) {}

  @Get()
  async range(@CurrentUser() u: AuthUser, @Query('from') from?: string, @Query('to') to?: string) {
    const start = from ? new Date(from) : new Date();
    const end = to ? new Date(to) : new Date(start.getTime() + 31 * 86_400_000);
    if (isNaN(+start) || isNaN(+end) || end <= start || +end - +start > MAX_RANGE_MS) throw new BadRequestException('Choose a date range of up to two months');

    // Which packages the viewer can see, and for a parent which child each package belongs to
    let where: Prisma.SessionWhereInput = { type: 'LIVE', startsAt: { gte: start, lt: end } };
    const whose = new Map<string, string[]>();
    if (u.role === Role.STUDENT) {
      const e = await this.prisma.enrollment.findMany({ where: { userId: u.id, ...activeEnrollment() }, select: { packageId: true } });
      where = { ...where, packageId: { in: e.map((x) => x.packageId) } };
    } else if (u.role === Role.PARENT) {
      const e = await this.prisma.enrollment.findMany({ where: { user: { parentId: u.id }, ...activeEnrollment() }, select: { packageId: true, user: { select: { name: true } } } });
      e.forEach((x) => whose.set(x.packageId, [...(whose.get(x.packageId) ?? []), x.user.name]));
      where = { ...where, packageId: { in: [...whose.keys()] } };
    } else if (u.role === Role.INSTRUCTOR) {
      where = { ...where, instructorId: u.id };
    }

    const now = new Date();
    const rows = await this.prisma.session.findMany({
      where, orderBy: { startsAt: 'asc' }, take: 500,
      select: { id: true, title: true, startsAt: true, durationMin: true, endedAt: true, packageId: true, package: { select: { name: true, track: true } }, instructor: { select: { name: true } } },
    });
    return rows.map((s) => {
      const endsAt = new Date(s.startsAt!.getTime() + s.durationMin * 60_000);
      return {
        id: s.id, title: s.title, startsAt: s.startsAt, endsAt, durationMin: s.durationMin, packageName: s.package.name, track: s.package.track,
        instructorName: s.instructor?.name ?? null, forChildren: whose.get(s.packageId) ?? null,
        isLiveNow: !s.endedAt && now.getTime() >= s.startsAt!.getTime() - 15 * 60_000 && now <= endsAt,
        isPast: now > endsAt,
      };
    });
  }
}

@Module({ controllers: [ScheduleController] })
export class ScheduleModule {}
