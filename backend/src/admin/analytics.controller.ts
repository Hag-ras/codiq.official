import { Controller, Get, NotFoundException, Param, Query } from '@nestjs/common';
import { PaymentMethod, Role, Track } from '@prisma/client';
import { PrismaService } from '../common/infra.module';
import { Roles } from '../common/decorators';
import { avatarSrc } from '../common/avatar';

type Range = '30d' | '90d' | '12m';
const pad = (n: number) => String(n).padStart(2, '0');
const day = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const month = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;

/** Date window + bucket labels. 30d and 90d use daily buckets, 12m uses monthly buckets. */
function window(range?: string) {
  const r: Range = range === '90d' || range === '12m' ? range : '30d';
  const monthly = r === '12m';
  const now = new Date();
  const since = monthly ? new Date(now.getFullYear(), now.getMonth() - 11, 1) : new Date(now.getFullYear(), now.getMonth(), now.getDate() - (r === '90d' ? 89 : 29));
  const labels: string[] = [];
  for (let d = new Date(since); d <= now; monthly ? d.setMonth(d.getMonth() + 1) : d.setDate(d.getDate() + 1)) labels.push(monthly ? month(d) : day(d));
  const prevSince = monthly ? new Date(since.getFullYear() - 1, since.getMonth(), 1) : new Date(since.getTime() - (now.getTime() - since.getTime()));
  return { range: r, monthly, since, prevSince, labels, bucket: (d: Date) => (monthly ? month(d) : day(d)) };
}
const sum = (xs: number[]) => xs.reduce((n, x) => n + x, 0);

@Roles(Role.ADMIN)
@Controller('admin/analytics')
export class AnalyticsController {
  constructor(private prisma: PrismaService) {}

  /** Money: revenue over time, by method, by course and track, the payment funnel and discounts given. */
  @Get('revenue')
  async revenue(@Query('range') range?: string) {
    const w = window(range);
    const [paid, previous, attempts] = await Promise.all([
      this.prisma.payment.findMany({
        where: { status: 'PAID', paidAt: { gte: w.since } },
        select: { amount: true, discountAmount: true, method: true, billing: true, paidAt: true, package: { select: { id: true, name: true, track: true } } },
      }),
      this.prisma.payment.aggregate({ where: { status: 'PAID', paidAt: { gte: w.prevSince, lt: w.since } }, _sum: { amount: true }, _count: { _all: true } }),
      this.prisma.payment.groupBy({ by: ['status'], where: { createdAt: { gte: w.since } }, _count: { _all: true } }),
    ]);

    const series = new Map(w.labels.map((l) => [l, { revenue: 0, count: 0 }]));
    for (const p of paid) {
      const b = series.get(w.bucket(p.paidAt!));
      if (b) { b.revenue += p.amount; b.count++; }
    }
    const group = <K extends string>(key: (p: (typeof paid)[number]) => K) => {
      const m = new Map<K, { revenue: number; count: number }>();
      for (const p of paid) { const e = m.get(key(p)) ?? { revenue: 0, count: 0 }; e.revenue += p.amount; e.count++; m.set(key(p), e); }
      return m;
    };
    const byPackage = new Map<string, { id: string; name: string; track: Track; revenue: number; count: number }>();
    for (const p of paid) {
      const e = byPackage.get(p.package.id) ?? { id: p.package.id, name: p.package.name, track: p.package.track, revenue: 0, count: 0 };
      e.revenue += p.amount; e.count++; byPackage.set(p.package.id, e);
    }
    const total = sum(paid.map((p) => p.amount));
    const status = Object.fromEntries(attempts.map((a) => [a.status, a._count._all])) as Record<string, number>;
    const attemptsTotal = sum(Object.values(status));

    return {
      range: w.range, monthly: w.monthly,
      totals: {
        revenue: total, previousRevenue: previous._sum.amount ?? 0, paidCount: paid.length, previousPaidCount: previous._count._all,
        averageOrder: paid.length ? Math.round(total / paid.length) : 0,
        discountsGiven: sum(paid.map((p) => p.discountAmount)), couponOrders: paid.filter((p) => p.discountAmount > 0).length,
        recurringRevenue: sum(paid.filter((p) => p.billing === 'MONTHLY').map((p) => p.amount)),
      },
      series: [...series.entries()].map(([label, v]) => ({ label, ...v })),
      byMethod: [...group((p) => p.method as PaymentMethod).entries()].map(([method, v]) => ({ method, ...v })).sort((a, b) => b.revenue - a.revenue),
      byTrack: [...group((p) => p.package.track).entries()].map(([track, v]) => ({ track, ...v })).sort((a, b) => b.revenue - a.revenue),
      byPackage: [...byPackage.values()].sort((a, b) => b.revenue - a.revenue),
      funnel: {
        attempts: attemptsTotal, paid: status.PAID ?? 0, failed: status.FAILED ?? 0, pending: status.PENDING ?? 0, awaitingReview: status.AWAITING_REVIEW ?? 0,
        successRate: attemptsTotal ? Math.round(((status.PAID ?? 0) / attemptsTotal) * 100) : null,
      },
    };
  }

  /** People: sign-ups over time, students by track, enrollment health and conversion to paying. */
  @Get('students')
  async students(@Query('range') range?: string) {
    const w = window(range);
    const now = new Date();
    const [signups, studentCount, byTrack, enr, payers, learners] = await Promise.all([
      this.prisma.user.findMany({ where: { role: Role.STUDENT, createdAt: { gte: w.since } }, select: { createdAt: true } }),
      this.prisma.user.count({ where: { role: Role.STUDENT } }),
      this.prisma.user.groupBy({ by: ['track'], where: { role: Role.STUDENT }, _count: { _all: true } }),
      this.prisma.enrollment.findMany({ select: { status: true, activeUntil: true } }),
      this.prisma.payment.findMany({ where: { status: 'PAID' }, select: { studentId: true }, distinct: ['studentId'] }),
      this.prisma.sessionProgress.findMany({ where: { OR: [{ completed: true }, { attendedLive: true }] }, select: { userId: true }, distinct: ['userId'] }),
    ]);
    const series = new Map(w.labels.map((l) => [l, 0]));
    for (const u of signups) { const b = w.bucket(u.createdAt); if (series.has(b)) series.set(b, series.get(b)! + 1); }
    const active = enr.filter((e) => e.status === 'ACTIVE' && (!e.activeUntil || e.activeUntil > now)).length;
    const expired = enr.filter((e) => e.status === 'ACTIVE' && e.activeUntil && e.activeUntil <= now).length;
    return {
      range: w.range,
      totals: {
        students: studentCount, newInRange: signups.length, payingStudents: payers.length,
        conversionRate: studentCount ? Math.round((payers.length / studentCount) * 100) : 0,
        activeLearners: learners.length,
      },
      series: [...series.entries()].map(([label, count]) => ({ label, count })),
      byTrack: ['KIDS', 'SCHOOL', 'COLLEGE'].map((t) => ({ track: t, count: byTrack.find((b) => b.track === t)?._count._all ?? 0 })),
      enrollments: { active, expired, cancelled: enr.filter((e) => e.status === 'CANCELLED').length },
    };
  }

  /** Courses: how each course sells and how students do in it. */
  @Get('courses')
  async courses() {
    const [packages, paid, progress, attempts, subs] = await Promise.all([
      this.prisma.package.findMany({
        include: {
          sessions: { select: { id: true, assignment: { select: { id: true } }, quiz: { select: { id: true } } } },
          _count: { select: { enrollments: true } },
          enrollments: { where: { status: 'ACTIVE' }, select: { userId: true } },
        },
      }),
      this.prisma.payment.groupBy({ by: ['packageId'], where: { status: 'PAID' }, _sum: { amount: true }, _count: { _all: true } }),
      this.prisma.sessionProgress.findMany({ where: { completed: true }, select: { userId: true, sessionId: true } }),
      this.prisma.quizAttempt.findMany({ select: { score: true, quiz: { select: { sessionId: true } } } }),
      this.prisma.submission.findMany({ where: { status: 'GRADED', score: { not: null } }, select: { score: true, assignment: { select: { maxScore: true, sessionId: true } } } }),
    ]);
    const paidBy = new Map(paid.map((p) => [p.packageId, p]));
    return packages
      .map((p) => {
        const sessionIds = new Set(p.sessions.map((s) => s.id));
        const students = new Set(p.enrollments.map((e) => e.userId));
        const done = progress.filter((x) => sessionIds.has(x.sessionId) && students.has(x.userId)).length;
        const possible = students.size * sessionIds.size;
        const quiz = attempts.filter((a) => sessionIds.has(a.quiz.sessionId));
        const graded = subs.filter((s) => sessionIds.has(s.assignment.sessionId));
        return {
          id: p.id, name: p.name, track: p.track, isPublished: p.isPublished,
          sessions: sessionIds.size, enrollments: p._count.enrollments, activeStudents: students.size,
          revenue: paidBy.get(p.id)?._sum.amount ?? 0, paidCount: paidBy.get(p.id)?._count._all ?? 0,
          completionRate: possible ? Math.round((done / possible) * 100) : null,
          averageQuizScore: quiz.length ? Math.round(sum(quiz.map((q) => q.score)) / quiz.length) : null,
          averageGrade: graded.length ? Math.round((sum(graded.map((g) => (g.score! / g.assignment.maxScore) * 100)) / graded.length)) : null,
        };
      })
      .sort((a, b) => b.revenue - a.revenue);
  }

  /** Per-student payment analysis: who paid, how much, how often, which discounts. */
  @Get('student-payments')
  async studentPayments(@Query('q') q?: string, @Query('sort') sort?: string, @Query('filter') filter?: string) {
    const [stats, users, failed] = await Promise.all([
      this.prisma.payment.groupBy({ by: ['studentId'], where: { status: 'PAID' }, _sum: { amount: true, discountAmount: true }, _count: { _all: true }, _max: { paidAt: true } }),
      this.prisma.user.findMany({
        where: { role: Role.STUDENT, ...(q ? { OR: [{ name: { contains: q, mode: 'insensitive' } }, { email: { contains: q, mode: 'insensitive' } }] } : {}) },
        select: { id: true, name: true, email: true, track: true, createdAt: true, avatarKey: true, avatarUrl: true, _count: { select: { enrollments: true } } },
        take: 500,
      }),
      this.prisma.payment.groupBy({ by: ['studentId'], where: { status: 'FAILED' }, _count: { _all: true } }),
    ]);
    const s = new Map(stats.map((x) => [x.studentId, x]));
    const f = new Map(failed.map((x) => [x.studentId, x._count._all]));
    let rows = users.map((u) => {
      const x = s.get(u.id);
      return {
        id: u.id, name: u.name, email: u.email, track: u.track, joined: u.createdAt, avatar: avatarSrc({ id: u.id, avatarKey: u.avatarKey, avatarUrl: u.avatarUrl }),
        courses: u._count.enrollments, totalPaid: x?._sum.amount ?? 0, payments: x?._count._all ?? 0, discounts: x?._sum.discountAmount ?? 0,
        lastPaymentAt: x?._max.paidAt ?? null, failedPayments: f.get(u.id) ?? 0,
      };
    });
    if (filter === 'paid') rows = rows.filter((r) => r.payments > 0);
    if (filter === 'never') rows = rows.filter((r) => r.payments === 0);
    rows.sort(
      sort === 'recent' ? (a, b) => (b.lastPaymentAt?.getTime() ?? 0) - (a.lastPaymentAt?.getTime() ?? 0)
        : sort === 'name' ? (a, b) => a.name.localeCompare(b.name)
        : (a, b) => b.totalPaid - a.totalPaid,
    );
    return {
      totals: { students: rows.length, paying: rows.filter((r) => r.payments > 0).length, revenue: sum(rows.map((r) => r.totalPaid)), average: rows.filter((r) => r.payments > 0).length ? Math.round(sum(rows.map((r) => r.totalPaid)) / rows.filter((r) => r.payments > 0).length) : 0 },
      rows,
    };
  }

  @Get('student-payments/:id')
  async studentPaymentDetail(@Param('id') id: string) {
    const u = await this.prisma.user.findUnique({ where: { id }, select: { id: true, name: true, email: true, track: true, avatarKey: true, avatarUrl: true } });
    if (!u) throw new NotFoundException('Student not found');
    const [payments, enrollments] = await Promise.all([
      this.prisma.payment.findMany({
        where: { studentId: id }, orderBy: { createdAt: 'desc' },
        select: { id: true, amount: true, discountAmount: true, method: true, billing: true, status: true, providerRef: true, createdAt: true, paidAt: true, package: { select: { name: true } }, payer: { select: { name: true } }, coupon: { select: { code: true } } },
      }),
      this.prisma.enrollment.findMany({ where: { userId: id }, select: { billing: true, status: true, activeUntil: true, package: { select: { name: true } } } }),
    ]);
    return { student: { id: u.id, name: u.name, email: u.email, track: u.track, avatar: avatarSrc({ id: u.id, avatarKey: u.avatarKey, avatarUrl: u.avatarUrl }) }, payments, enrollments };
  }
}
