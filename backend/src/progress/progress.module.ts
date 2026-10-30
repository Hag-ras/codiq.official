import { Controller, ForbiddenException, Get, Injectable, Module, Param } from '@nestjs/common';
import { Role } from '@prisma/client';
import { PrismaService } from '../common/infra.module';
import { AuthUser, CurrentUser, Roles } from '../common/decorators';

const DAY = 86_400_000;
/** "2026-10-30" for the Cairo calendar day of a moment. Streaks count Cairo days, not UTC days. */
const cairoDay = (d: Date) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Cairo' }).format(d);
const LIVE_MIN_SECONDS = 10 * 60;

export interface Stats {
  points: number;
  streak: number;
  /** Longest run of days in a row so far */
  bestStreak: number;
  activeToday: boolean;
  level: number;
  levelFloor: number;
  levelCeil: number;
  /** Where the points came from, so the number is not a mystery */
  breakdown: { lessons: number; liveClasses: number; quizzes: number; assignments: number };
}

/**
 * Light gamification computed from what students already did: no extra tables, nothing to cheat.
 * Points: 10 per finished lesson, 15 per live class attended 10+ minutes, quizzes up to 20 (10 for the score, 10 for passing),
 * assignments 5 for handing in plus up to 10 for the grade. Level n starts at 40 * (n-1)^2 points.
 */
@Injectable()
export class ProgressService {
  constructor(private prisma: PrismaService) {}

  async stats(userId: string): Promise<Stats> {
    const [progress, submissions, attempts, attendance] = await Promise.all([
      this.prisma.sessionProgress.findMany({ where: { userId }, select: { completed: true, updatedAt: true } }),
      this.prisma.submission.findMany({ where: { studentId: userId }, select: { submittedAt: true, gradedAt: true, score: true, assignment: { select: { maxScore: true } } } }),
      this.prisma.quizAttempt.findMany({ where: { studentId: userId }, select: { quizId: true, score: true, createdAt: true, quiz: { select: { passScore: true } } } }),
      this.prisma.liveAttendance.findMany({ where: { userId }, select: { firstJoinAt: true, lastSeenAt: true, attendedSeconds: true } }),
    ]);

    const lessons = progress.filter((p) => p.completed).length * 10;
    const liveClasses = attendance.filter((a) => a.attendedSeconds >= LIVE_MIN_SECONDS).length * 15;
    const best = new Map<string, { score: number; pass: number }>();
    for (const a of attempts) if (!best.has(a.quizId) || a.score > best.get(a.quizId)!.score) best.set(a.quizId, { score: a.score, pass: a.quiz.passScore });
    const quizzes = [...best.values()].reduce((n, b) => n + Math.round(b.score / 10) + (b.score >= b.pass ? 10 : 0), 0);
    const assignments = submissions.reduce((n, s) => n + 5 + (s.score != null && s.assignment.maxScore ? Math.round((s.score / s.assignment.maxScore) * 10) : 0), 0);
    const points = lessons + liveClasses + quizzes + assignments;

    const days = new Set<string>();
    progress.forEach((p) => days.add(cairoDay(p.updatedAt)));
    submissions.forEach((s) => days.add(cairoDay(s.submittedAt)));
    attempts.forEach((a) => days.add(cairoDay(a.createdAt)));
    attendance.forEach((a) => {
      if (a.attendedSeconds < 60) return;
      days.add(cairoDay(a.firstJoinAt));
      days.add(cairoDay(a.lastSeenAt));
    });

    const now = new Date();
    const activeToday = days.has(cairoDay(now));
    // A streak is still alive if the last active day was yesterday: today isn't over yet
    let cursor = activeToday ? now : new Date(now.getTime() - DAY);
    let streak = 0;
    while (days.has(cairoDay(cursor))) { streak++; cursor = new Date(cursor.getTime() - DAY); }

    const sorted = [...days].sort();
    let bestStreak = 0, run = 0, prev = 0;
    for (const d of sorted) {
      const t = Date.parse(`${d}T12:00:00Z`);
      run = prev && Math.round((t - prev) / DAY) === 1 ? run + 1 : 1;
      prev = t;
      bestStreak = Math.max(bestStreak, run);
    }

    const level = Math.floor(Math.sqrt(points / 40)) + 1;
    return { points, streak, bestStreak, activeToday, level, levelFloor: 40 * (level - 1) ** 2, levelCeil: 40 * level ** 2, breakdown: { lessons, liveClasses, quizzes, assignments } };
  }

  /** Activity in the last `days` days, for the parent's weekly email. */
  async recent(userId: string, days = 7) {
    const since = new Date(Date.now() - days * DAY);
    const [done, live, attempts, submitted, graded] = await Promise.all([
      this.prisma.sessionProgress.count({ where: { userId, completed: true, updatedAt: { gte: since } } }),
      this.prisma.liveAttendance.count({ where: { userId, lastSeenAt: { gte: since }, attendedSeconds: { gte: LIVE_MIN_SECONDS } } }),
      this.prisma.quizAttempt.findMany({ where: { studentId: userId, createdAt: { gte: since } }, orderBy: { createdAt: 'asc' }, select: { score: true, quiz: { select: { title: true } } } }),
      this.prisma.submission.count({ where: { studentId: userId, submittedAt: { gte: since } } }),
      this.prisma.submission.findMany({ where: { studentId: userId, gradedAt: { gte: since } }, select: { score: true, assignment: { select: { title: true, maxScore: true } } } }),
    ]);
    return {
      classesDone: done,
      liveAttended: live,
      quizzes: attempts.map((a) => ({ title: a.quiz.title, score: a.score })),
      submitted,
      graded: graded.filter((g) => g.score != null).map((g) => ({ title: g.assignment.title, score: g.score!, max: g.assignment.maxScore })),
    };
  }
}

@Controller('progress')
class ProgressController {
  constructor(private progress: ProgressService, private prisma: PrismaService) {}

  @Roles(Role.STUDENT)
  @Get('stats')
  mine(@CurrentUser() u: AuthUser) { return this.progress.stats(u.id); }

  @Roles(Role.PARENT)
  @Get('stats/:childId')
  async child(@CurrentUser() u: AuthUser, @Param('childId') childId: string) {
    const kid = await this.prisma.user.findFirst({ where: { id: childId, parentId: u.id }, select: { id: true } });
    if (!kid) throw new ForbiddenException();
    return this.progress.stats(childId);
  }
}

@Module({ controllers: [ProgressController], providers: [ProgressService], exports: [ProgressService] })
export class ProgressModule {}
