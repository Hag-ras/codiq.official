import { BadRequestException, Body, Controller, Get, Header, HttpCode, NotFoundException, Module, Param, Post, Query, Res } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Response } from 'express';
import { Prisma, Role } from '@prisma/client';
import { randomBytes } from 'crypto';
import { activeEnrollment, PrismaService } from '../common/infra.module';
import { AuthUser, CurrentUser, Public } from '../common/decorators';

const MAX_RANGE_MS = 62 * 86_400_000;

/** Folds a line to 75 characters as the iCalendar format requires, and escapes the characters that have a meaning in it. */
const esc = (s: string) => s.replace(/\\/g, '\\\\').replace(/;/g, '\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
const fold = (line: string) => (line.length <= 73 ? line : line.match(/.{1,73}/g)!.join('\r\n '));
const utc = (d: Date) => d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');

/** Live classes in a date range, for the calendar page and for the calendar feed people add to their phone. */
@Controller('schedule')
class ScheduleController {
  constructor(private prisma: PrismaService, private config: ConfigService) {}

  /** The live classes a person may see: their own packages (student), their children's (parent), the ones they teach (instructor), or all (staff). */
  private async visible(u: { id: string; role: Role }, start: Date, end: Date) {
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
    const rows = await this.prisma.session.findMany({
      where, orderBy: { startsAt: 'asc' }, take: 500,
      select: { id: true, title: true, startsAt: true, durationMin: true, endedAt: true, packageId: true, package: { select: { name: true, track: true } }, instructor: { select: { name: true } } },
    });
    return { rows, whose };
  }

  @Get()
  async range(@CurrentUser() u: AuthUser, @Query('from') from?: string, @Query('to') to?: string) {
    const start = from ? new Date(from) : new Date();
    const end = to ? new Date(to) : new Date(start.getTime() + 31 * 86_400_000);
    if (isNaN(+start) || isNaN(+end) || end <= start || +end - +start > MAX_RANGE_MS) throw new BadRequestException('Choose a date range of up to two months');
    const { rows, whose } = await this.visible(u, start, end);
    const now = new Date();
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

  /** The private link for the person's calendar app. With rotate=true the old link stops working. */
  @Post('calendar-link') @HttpCode(200)
  async link(@CurrentUser() u: AuthUser, @Body() body: { rotate?: boolean }) {
    const me = await this.prisma.user.findUniqueOrThrow({ where: { id: u.id }, select: { calendarToken: true } });
    let token = me.calendarToken;
    if (!token || body?.rotate) {
      token = randomBytes(24).toString('base64url');
      await this.prisma.user.update({ where: { id: u.id }, data: { calendarToken: token } });
    }
    const base = this.config.get<string>('API_PUBLIC_URL') || this.config.get<string>('FRONTEND_URL', 'http://localhost:3000');
    return { url: `${base.replace(/\/$/, '')}/api/schedule/feed/${token}.ics` };
  }

  /** Read by Google Calendar, Apple Calendar and Outlook. The secret token in the address is the only credential. */
  @Public()
  @Get('feed/:file')
  @Header('Content-Type', 'text/calendar; charset=utf-8')
  async feed(@Param('file') file: string, @Res({ passthrough: true }) res: Response) {
    const token = file.replace(/\.ics$/, '');
    const user = token.length >= 20 ? await this.prisma.user.findUnique({ where: { calendarToken: token }, select: { id: true, role: true, deletedAt: true } }) : null;
    if (!user || user.deletedAt) throw new NotFoundException();
    const now = new Date();
    const { rows } = await this.visible(user, new Date(now.getTime() - 14 * 86_400_000), new Date(now.getTime() + 180 * 86_400_000));
    const web = this.config.get<string>('FRONTEND_URL', 'http://localhost:3000');
    const lines = [
      'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Codiq//Live classes//EN', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH',
      'X-WR-CALNAME:Codiq classes', 'X-WR-TIMEZONE:Africa/Cairo', 'REFRESH-INTERVAL;VALUE=DURATION:PT6H', 'X-PUBLISHED-TTL:PT6H',
      ...rows.flatMap((s) => [
        'BEGIN:VEVENT',
        `UID:${s.id}@codiq`,
        `DTSTAMP:${utc(now)}`,
        `DTSTART:${utc(s.startsAt!)}`,
        `DTEND:${utc(new Date(s.startsAt!.getTime() + s.durationMin * 60_000))}`,
        `SUMMARY:${esc(s.title)}`,
        `DESCRIPTION:${esc(`${s.package.name}${s.instructor ? ` with ${s.instructor.name}` : ''}\n${web}/dashboard/sessions/${s.id}`)}`,
        `URL:${web}/dashboard/sessions/${s.id}`,
        ...(s.endedAt ? [] : ['BEGIN:VALARM', 'ACTION:DISPLAY', `DESCRIPTION:${esc(s.title)}`, 'TRIGGER:-PT15M', 'END:VALARM']),
        'END:VEVENT',
      ]),
      'END:VCALENDAR',
    ];
    res.setHeader('Cache-Control', 'private, max-age=300');
    return lines.map(fold).join('\r\n') + '\r\n';
  }
}

@Module({ controllers: [ScheduleController] })
export class ScheduleModule {}
