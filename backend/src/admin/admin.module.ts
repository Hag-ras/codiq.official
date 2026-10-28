import { Controller, Get, Module, NotFoundException, Param } from '@nestjs/common';
import { Role } from '@prisma/client';
import { PrismaService } from '../common/infra.module';
import { Roles } from '../common/decorators';
import { avatarSrc } from '../common/avatar';
import { AnalyticsController } from './analytics.controller';

const monthKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;

@Roles(Role.ADMIN)
@Controller('admin')
class AdminController {
  constructor(private prisma: PrismaService) {}

  /** Everything the admin overview page needs, in one call. Amounts are in piasters. */
  @Get('stats')
  async stats() {
    const now = new Date();
    const since30 = new Date(now.getTime() - 30 * 86_400_000);
    const sixMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 5, 1);
    const activeEnr = { status: 'ACTIVE' as const, OR: [{ activeUntil: null }, { activeUntil: { gt: now } }] };

    const [roles, newUsers, activeEnrollments, enrollmentsByPkg, paidAgg, paidRecent, awaitingReview, pending, recentPayments, recentUsers, sessionsCount, packagesCount] =
      await Promise.all([
        this.prisma.user.groupBy({ by: ['role'], _count: { _all: true } }),
        this.prisma.user.count({ where: { createdAt: { gte: since30 } } }),
        this.prisma.enrollment.count({ where: activeEnr }),
        this.prisma.enrollment.findMany({ where: activeEnr, select: { package: { select: { track: true } } } }),
        this.prisma.payment.aggregate({ where: { status: 'PAID' }, _sum: { amount: true }, _count: { _all: true } }),
        this.prisma.payment.findMany({ where: { status: 'PAID', paidAt: { gte: sixMonthsAgo } }, select: { amount: true, paidAt: true } }),
        this.prisma.payment.count({ where: { status: 'AWAITING_REVIEW' } }),
        this.prisma.payment.count({ where: { status: 'PENDING' } }),
        this.prisma.payment.findMany({
          orderBy: { createdAt: 'desc' }, take: 8,
          select: { id: true, amount: true, method: true, status: true, createdAt: true, payer: { select: { name: true } }, package: { select: { name: true } } },
        }),
        this.prisma.user.findMany({ orderBy: { createdAt: 'desc' }, take: 6, select: { id: true, name: true, email: true, role: true, createdAt: true, avatarKey: true, avatarUrl: true } }),
        this.prisma.session.count(),
        this.prisma.package.count(),
      ]);

    const months: Record<string, number> = {};
    for (let i = 5; i >= 0; i--) months[monthKey(new Date(now.getFullYear(), now.getMonth() - i, 1))] = 0;
    for (const p of paidRecent) if (p.paidAt) { const k = monthKey(p.paidAt); if (k in months) months[k] += p.amount; }

    const byTrack: Record<string, number> = { KIDS: 0, SCHOOL: 0, COLLEGE: 0 };
    for (const e of enrollmentsByPkg) byTrack[e.package.track]++;

    return {
      users: { total: roles.reduce((n, r) => n + r._count._all, 0), newLast30Days: newUsers, byRole: Object.fromEntries(roles.map((r) => [r.role, r._count._all])) },
      enrollments: { active: activeEnrollments, byTrack },
      revenue: { total: paidAgg._sum.amount ?? 0, paidPayments: paidAgg._count._all, byMonth: Object.entries(months).map(([month, amount]) => ({ month, amount })) },
      payments: { awaitingReview, pending },
      content: { sessions: sessionsCount, packages: packagesCount },
      recentPayments,
      recentUsers: recentUsers.map(({ avatarKey, avatarUrl, ...u }) => ({ ...u, avatar: avatarSrc({ id: u.id, avatarKey, avatarUrl }) })),
    };
  }

  /** Every assignment with how much work has come in. */
  @Get('assignments')
  async assignments() {
    const list = await this.prisma.assignment.findMany({
      orderBy: { session: { createdAt: 'desc' } },
      include: {
        session: { select: { id: true, title: true, package: { select: { id: true, name: true, track: true } }, instructor: { select: { name: true } } } },
        submissions: { select: { status: true, score: true } },
      },
    });
    const enrolled = await this.prisma.enrollment.groupBy({ by: ['packageId'], where: { status: 'ACTIVE' }, _count: { _all: true } });
    const byPkg = new Map(enrolled.map((e) => [e.packageId, e._count._all]));
    return list.map((a) => {
      const graded = a.submissions.filter((s) => s.status === 'GRADED');
      return {
        id: a.id, title: a.title, dueAt: a.dueAt, maxScore: a.maxScore,
        session: { id: a.session.id, title: a.session.title, instructorName: a.session.instructor?.name ?? null },
        package: a.session.package,
        students: byPkg.get(a.session.package.id) ?? 0,
        submitted: a.submissions.length, graded: graded.length, toGrade: a.submissions.length - graded.length,
        averageScore: graded.length ? Math.round((graded.reduce((n, s) => n + (s.score ?? 0), 0) / graded.length) * 10) / 10 : null,
      };
    });
  }

  @Get('assignments/:id')
  async assignment(@Param('id') id: string) {
    const a = await this.prisma.assignment.findUnique({
      where: { id },
      include: {
        session: { select: { id: true, title: true, package: { select: { name: true, track: true } }, instructor: { select: { name: true } } } },
        submissions: {
          orderBy: { submittedAt: 'desc' },
          include: { student: { select: { id: true, name: true, email: true, avatarKey: true, avatarUrl: true } } },
        },
      },
    });
    if (!a) throw new NotFoundException('Assignment not found');
    return {
      id: a.id, title: a.title, brief: a.brief, dueAt: a.dueAt, maxScore: a.maxScore,
      session: { id: a.session.id, title: a.session.title, instructorName: a.session.instructor?.name ?? null },
      package: a.session.package,
      submissions: a.submissions.map((s) => ({
        id: s.id, text: s.text, fileName: s.fileName, hasFile: !!s.fileKey, status: s.status, score: s.score, feedback: s.feedback, submittedAt: s.submittedAt, gradedAt: s.gradedAt,
        student: { id: s.student.id, name: s.student.name, email: s.student.email, avatar: avatarSrc({ id: s.student.id, avatarKey: s.student.avatarKey, avatarUrl: s.student.avatarUrl }) },
      })),
    };
  }
}

@Module({ controllers: [AdminController, AnalyticsController] })
export class AdminModule {}
