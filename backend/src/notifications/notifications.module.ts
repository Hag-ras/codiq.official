import { Global, Injectable, Logger, Module, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import { MailService, PrismaService, activeEnrollment } from '../common/infra.module';
import { asLang, assignmentGradedMail, assignmentNewMail, certificateMail, liveReminderMail, quizResultMail, renewalMail, weeklyDigestMail, type DigestChild, type Lang } from '../common/mail-templates';
import { ProgressModule, ProgressService } from '../progress/progress.module';

const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;
const TICK = 5 * MIN;

type Person = { id: string; name: string; email: string; isParent: boolean; lang: Lang };

/**
 * Every email that is not an answer to a click: class reminders, renewal reminders, the parent's weekly summary,
 * and "new assignment / graded / quiz result" emails to parents.
 *
 * The scheduled jobs run on a timer inside the API. Each email first claims a row in NotificationLog (unique on kind + key),
 * so a reminder is sent at most once even if the server restarts or several API servers run at the same time.
 * Set JOBS_ENABLED=false to switch the timer off (the event emails still work).
 */
@Injectable()
export class NotificationsService implements OnModuleInit, OnModuleDestroy {
  private log = new Logger('Notifications');
  private timer?: NodeJS.Timeout;
  private running = false;

  constructor(private prisma: PrismaService, private mail: MailService, private config: ConfigService, private progress: ProgressService) {}

  private get web() { return this.config.get<string>('FRONTEND_URL', 'http://localhost:3000'); }

  onModuleInit() {
    if (this.config.get('JOBS_ENABLED', 'true') === 'false') return this.log.warn('JOBS_ENABLED=false: scheduled emails are off');
    setTimeout(() => void this.tick(), 30_000).unref();
    this.timer = setInterval(() => void this.tick(), TICK);
    this.timer.unref();
  }
  onModuleDestroy() { if (this.timer) clearInterval(this.timer); }

  /** One pass of every scheduled job. Safe to call any time; also used by the test script. */
  async tick(now = new Date()) {
    if (this.running) return;
    this.running = true;
    try {
      await this.liveReminders(now);
      await this.renewalReminders(now);
      await this.weeklyDigest(now);
      await this.prisma.notificationLog.deleteMany({ where: { sentAt: { lt: new Date(now.getTime() - 120 * DAY) } } });
    } catch (e) {
      this.log.error(`Scheduled jobs failed: ${(e as Error).message}`);
    } finally {
      this.running = false;
    }
  }

  /** Sends one email and then pauses briefly: Resend allows about 2 requests a second, a burst would be rejected. */
  private async deliver(to: string, m: { subject: string; text: string; html: string }) {
    await this.mail.sendTemplate(to, m);
    if (this.config.get('RESEND_API_KEY')) await new Promise((r) => setTimeout(r, 600));
  }

  /** True the first time (kind, key) is seen. The unique index makes this safe across processes. */
  private async claim(kind: string, key: string) {
    try {
      await this.prisma.notificationLog.create({ data: { kind, key } });
      return true;
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') return false;
      throw e;
    }
  }

  /** The student and their linked parent, leaving out anyone who turned emails off. */
  private async audience(studentId: string, who: { student?: boolean; parent?: boolean }): Promise<{ studentName: string; people: Person[] }> {
    const s = await this.prisma.user.findUnique({ where: { id: studentId }, select: { name: true, email: true, emailNotifications: true, language: true, parent: { select: { id: true, name: true, email: true, emailNotifications: true, language: true } } } });
    if (!s) return { studentName: '', people: [] };
    const people: Person[] = [];
    if (who.student && s.emailNotifications) people.push({ id: studentId, name: s.name, email: s.email, isParent: false, lang: asLang(s.language) });
    if (who.parent && s.parent?.emailNotifications) people.push({ id: s.parent.id, name: s.parent.name, email: s.parent.email, isParent: true, lang: asLang(s.parent.language) });
    return { studentName: s.name, people };
  }

  // ---- Scheduled: live class reminders (tomorrow, and about an hour before) ----
  async liveReminders(now: Date) {
    const sessions = await this.prisma.session.findMany({
      where: { type: 'LIVE', endedAt: null, startsAt: { gt: now, lte: new Date(now.getTime() + DAY) } },
      select: { id: true, title: true, startsAt: true, packageId: true, package: { select: { name: true } } },
    });
    for (const s of sessions) {
      const soon = s.startsAt!.getTime() - now.getTime() <= HOUR;
      const kind = soon ? 'live-1h' : 'live-24h';
      const students = await this.prisma.enrollment.findMany({ where: { ...activeEnrollment(s.packageId), user: { role: 'STUDENT' } }, select: { userId: true } });
      for (const { userId } of students) {
        const { studentName, people } = await this.audience(userId, { student: true, parent: true });
        for (const p of people) {
          if (!(await this.claim(kind, `${s.id}:${p.id}:${userId}`))) continue;
          await this.deliver(p.email, liveReminderMail({
            lang: p.lang, name: p.name, studentName, isParent: p.isParent, sessionTitle: s.title, packageName: s.package.name, startsAt: s.startsAt!, soon, url: `${this.web}/dashboard/sessions/${s.id}`,
          }));
        }
      }
    }
  }

  // ---- Scheduled: monthly plan about to end (3 days, 1 day) or just ended ----
  async renewalReminders(now: Date) {
    const rows = await this.prisma.enrollment.findMany({
      where: { billing: 'MONTHLY', status: 'ACTIVE', activeUntil: { gt: new Date(now.getTime() - DAY), lte: new Date(now.getTime() + 3 * DAY) } },
      select: { id: true, userId: true, activeUntil: true, package: { select: { name: true } } },
    });
    for (const e of rows) {
      const until = e.activeUntil!;
      const left = until.getTime() - now.getTime();
      const expired = left <= 0;
      const kind = expired ? 'renew-ended' : left <= DAY ? 'renew-1d' : 'renew-3d';
      const { studentName, people } = await this.audience(e.userId, { student: true, parent: true });
      for (const p of people) {
        if (!(await this.claim(kind, `${e.id}:${until.getTime()}:${p.id}`))) continue;
        await this.deliver(p.email, renewalMail({
          lang: p.lang, name: p.name, studentName, isParent: p.isParent, packageName: e.package.name, until, daysLeft: Math.max(1, Math.ceil(left / DAY)), expired, autoRenew: false, url: `${this.web}/dashboard/billing`,
        }));
      }
    }
  }

  // ---- Scheduled: parent's weekly summary (Fridays from 10:00 Cairo time) ----
  async weeklyDigest(now: Date) {
    const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: 'Africa/Cairo', weekday: 'short', hour: 'numeric', hourCycle: 'h23' }).formatToParts(now).map((p) => [p.type, p.value]));
    if (parts.weekday !== 'Fri' || Number(parts.hour) < 10) return;
    const day = new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Cairo' }).format(now);
    const parents = await this.prisma.user.findMany({
      where: { role: 'PARENT', emailNotifications: true, children: { some: { enrollments: { some: activeEnrollment() } } } },
      select: { id: true, name: true, email: true, language: true, children: { select: { id: true, name: true, enrollments: { where: activeEnrollment(), select: { packageId: true } } } } },
    });
    for (const parent of parents) {
      if (!(await this.claim('weekly', `${parent.id}:${day}`))) continue;
      const kids: DigestChild[] = [];
      for (const c of parent.children.filter((k) => k.enrollments.length)) {
        const [recent, stats, nextLive, overdue] = await Promise.all([
          this.progress.recent(c.id, 7),
          this.progress.stats(c.id),
          this.prisma.session.findFirst({ where: { type: 'LIVE', endedAt: null, startsAt: { gt: now }, packageId: { in: c.enrollments.map((e) => e.packageId) } }, orderBy: { startsAt: 'asc' }, select: { title: true, startsAt: true } }),
          this.prisma.assignment.findMany({
            where: { dueAt: { lt: now }, session: { packageId: { in: c.enrollments.map((e) => e.packageId) } }, submissions: { none: { studentId: c.id } } },
            select: { title: true }, take: 5,
          }),
        ]);
        kids.push({ name: c.name, ...recent, streak: stats.streak, points: stats.points, nextLive: nextLive ? { title: nextLive.title, startsAt: nextLive.startsAt! } : null, overdue: overdue.map((o) => o.title) });
      }
      if (kids.length) await this.deliver(parent.email, weeklyDigestMail(parent.name, kids, `${this.web}/dashboard`, asLang(parent.language)));
    }
  }

  // ---- Events: called right after something happens ----

  /** A brand new assignment was added to a session: tell the parent of every enrolled student. */
  async assignmentPosted(assignmentId: string) {
    const a = await this.prisma.assignment.findUnique({ where: { id: assignmentId }, select: { id: true, title: true, dueAt: true, maxScore: true, session: { select: { id: true, title: true, packageId: true, package: { select: { name: true } } } } } });
    if (!a) return;
    const students = await this.prisma.enrollment.findMany({ where: { ...activeEnrollment(a.session.packageId), user: { role: 'STUDENT', parentId: { not: null } } }, select: { userId: true } });
    for (const { userId } of students) {
      const { studentName, people } = await this.audience(userId, { parent: true });
      for (const p of people) {
        if (!(await this.claim('assignment-new', `${a.id}:${p.id}:${userId}`))) continue;
        await this.deliver(p.email, assignmentNewMail({
          lang: p.lang, parentName: p.name, studentName, title: a.title, lesson: a.session.title, packageName: a.session.package.name, dueAt: a.dueAt, maxScore: a.maxScore,
          url: `${this.web}/dashboard/children/${userId}`,
        }));
      }
    }
  }

  /** An instructor graded an assignment. */
  async assignmentGraded(submissionId: string) {
    const s = await this.prisma.submission.findUnique({ where: { id: submissionId }, select: { id: true, studentId: true, score: true, feedback: true, gradedAt: true, assignment: { select: { title: true, maxScore: true } } } });
    if (!s || s.score == null || !s.gradedAt) return;
    const { studentName, people } = await this.audience(s.studentId, { parent: true });
    for (const p of people) {
      if (!(await this.claim('assignment-graded', `${s.id}:${s.gradedAt.getTime()}:${p.id}`))) continue;
      await this.deliver(p.email, assignmentGradedMail({
        lang: p.lang, parentName: p.name, studentName, title: s.assignment.title, score: s.score, maxScore: s.assignment.maxScore, feedback: s.feedback, url: `${this.web}/dashboard/children/${s.studentId}`,
      }));
    }
  }

  /** A student finished a quiz. */
  async quizResult(attemptId: string) {
    const a = await this.prisma.quizAttempt.findUnique({ where: { id: attemptId }, select: { id: true, studentId: true, score: true, quiz: { select: { title: true, passScore: true } } } });
    if (!a) return;
    const { studentName, people } = await this.audience(a.studentId, { parent: true });
    for (const p of people) {
      if (!(await this.claim('quiz-result', `${a.id}:${p.id}`))) continue;
      await this.deliver(p.email, quizResultMail({
        lang: p.lang, parentName: p.name, studentName, quizTitle: a.quiz.title, score: a.score, passScore: a.quiz.passScore, url: `${this.web}/dashboard/children/${a.studentId}`,
      }));
    }
  }

  /** Sent to the student when they earn a certificate. The link downloads the PDF (they are usually still signed in). */
  async certificateIssued(userId: string, packageId: string, packageName: string) {
    const u = await this.prisma.user.findUnique({ where: { id: userId }, select: { name: true, email: true, emailNotifications: true, language: true } });
    if (u?.emailNotifications) await this.deliver(u.email, certificateMail(u.name, packageName, `${this.web}/api/certificates/${packageId}/pdf`, asLang(u.language)));
  }
}

@Global()
@Module({ imports: [ProgressModule], providers: [NotificationsService], exports: [NotificationsService] })
export class NotificationsModule {}
