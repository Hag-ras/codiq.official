import { Body, ConflictException, Controller, Delete, Get, HttpCode, Module, NotFoundException, Param, Post } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { Equals, IsEmail } from 'class-validator';
import { Role } from '@prisma/client';
import { activeEnrollment, PrismaService } from '../common/infra.module';
import { AuthUser, CurrentUser, Roles } from '../common/decorators';

class LinkChildDto {
  @IsEmail() email!: string;
  /** The parent confirms they are this student's parent or legal guardian */
  @Equals(true, { message: 'Please confirm that you are the parent or legal guardian' }) confirmGuardian!: boolean;
}

@Roles(Role.PARENT)
@Controller('parents/children')
class ParentsController {
  constructor(private prisma: PrismaService) {}

  @Get()
  async children(@CurrentUser() u: AuthUser) {
    const kids = await this.prisma.user.findMany({
      where: { parentId: u.id },
      select: {
        id: true, name: true, email: true, track: true,
        enrollments: { where: activeEnrollment(), include: { package: { select: { id: true, name: true, _count: { select: { sessions: true } } } } } },
        progress: { select: { completed: true, attendedLive: true } },
        quizAttempts: { orderBy: { createdAt: 'desc' }, take: 5, select: { score: true, createdAt: true, quiz: { select: { title: true } } } },
        submissions: { orderBy: { submittedAt: 'desc' }, take: 5, select: { status: true, score: true, assignment: { select: { title: true, maxScore: true } } } },
      },
    });
    const now = new Date();
    return Promise.all(
      kids.map(async (k) => {
        const nextLive = await this.prisma.session.findFirst({
          where: { type: 'LIVE', startsAt: { gt: now }, packageId: { in: k.enrollments.map((e) => e.packageId) } },
          orderBy: { startsAt: 'asc' },
          select: { id: true, title: true, startsAt: true },
        });
        const total = k.enrollments.reduce((n, e) => n + e.package._count.sessions, 0);
        return {
          id: k.id, name: k.name, email: k.email, track: k.track,
          packages: k.enrollments.map((e) => ({ id: e.package.id, name: e.package.name, billing: e.billing, activeUntil: e.activeUntil })),
          sessionsTotal: total,
          sessionsCompleted: k.progress.filter((p) => p.completed).length,
          liveAttended: k.progress.filter((p) => p.attendedLive).length,
          recentQuizzes: k.quizAttempts,
          recentSubmissions: k.submissions,
          nextLive,
        };
      }),
    );
  }

  /** Full progress report for one child: per package, every session, quiz result and assignment. */
  @Get(':id/progress')
  async progress(@CurrentUser() u: AuthUser, @Param('id') id: string) {
    const kid = await this.prisma.user.findFirst({ where: { id, parentId: u.id }, select: { id: true, name: true, email: true, phone: true, track: true } });
    if (!kid) throw new NotFoundException('Child not found');
    const enrollments = await this.prisma.enrollment.findMany({
      where: { userId: id, status: 'ACTIVE' }, orderBy: { createdAt: 'asc' },
      include: {
        package: {
          select: {
            id: true, name: true,
            sessions: {
              orderBy: { order: 'asc' },
              select: {
                id: true, order: true, title: true, type: true, startsAt: true,
                progress: { where: { userId: id }, select: { completed: true, attendedLive: true, watchedSeconds: true } },
                quiz: { select: { title: true, passScore: true, attempts: { where: { studentId: id }, orderBy: { createdAt: 'desc' }, select: { score: true, createdAt: true } } } },
                assignment: { select: { title: true, dueAt: true, maxScore: true, submissions: { where: { studentId: id }, select: { status: true, score: true, feedback: true, submittedAt: true } } } },
              },
            },
          },
        },
      },
    });
    const now = new Date();
    return {
      child: kid,
      packages: enrollments.map((e) => {
        const sessions = e.package.sessions.map((s) => {
          const p = s.progress[0];
          const attempts = s.quiz?.attempts ?? [];
          const sub = s.assignment?.submissions[0];
          const best = attempts.length ? Math.max(...attempts.map((a) => a.score)) : null;
          return {
            id: s.id, order: s.order, title: s.title, type: s.type, startsAt: s.startsAt,
            completed: !!p?.completed, attendedLive: !!p?.attendedLive, minutesWatched: Math.round((p?.watchedSeconds ?? 0) / 60),
            quiz: s.quiz ? { title: s.quiz.title, passScore: s.quiz.passScore, attempts: attempts.length, bestScore: best } : null,
            assignment: s.assignment
              ? {
                  title: s.assignment.title, dueAt: s.assignment.dueAt, maxScore: s.assignment.maxScore,
                  state: sub ? (sub.status === 'GRADED' ? 'GRADED' : 'SUBMITTED') : s.assignment.dueAt && s.assignment.dueAt < now ? 'MISSING' : 'TODO',
                  score: sub?.score ?? null, feedback: sub?.feedback ?? null, submittedAt: sub?.submittedAt ?? null,
                }
              : null,
          };
        });
        return {
          id: e.package.id, name: e.package.name, billing: e.billing, activeUntil: e.activeUntil,
          sessionsTotal: sessions.length, sessionsCompleted: sessions.filter((s) => s.completed).length, liveAttended: sessions.filter((s) => s.attendedLive).length,
          sessions,
        };
      }),
    };
  }

  /**
   * Asks to be linked to a child who ALREADY has a student account. Nothing is created and nothing is shared
   * until the student accepts the request in their own dashboard.
   */
  @Post() @HttpCode(200)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  async requestLink(@CurrentUser() u: AuthUser, @Body() dto: LinkChildDto) {
    const student = await this.prisma.user.findUnique({ where: { email: dto.email.toLowerCase() }, select: { id: true, name: true, role: true, parentId: true } });
    if (!student || student.role !== Role.STUDENT)
      throw new NotFoundException("We couldn't find a student account with that email. Your child needs to sign up on Codiq first, then you can link them here.");
    if (student.parentId === u.id) throw new ConflictException(`${student.name} is already linked to your account`);
    if (student.parentId) throw new ConflictException('That student is already linked to another parent account');
    const request = await this.prisma.parentLinkRequest.upsert({
      where: { parentId_studentId: { parentId: u.id, studentId: student.id } },
      update: { status: 'PENDING', guardianConfirmedAt: new Date() },
      create: { parentId: u.id, studentId: student.id, guardianConfirmedAt: new Date() },
      select: { id: true },
    });
    return { id: request.id, studentName: student.name, status: 'PENDING' as const };
  }

  @Get('requests')
  requests(@CurrentUser() u: AuthUser) {
    return this.prisma.parentLinkRequest.findMany({
      where: { parentId: u.id }, orderBy: { createdAt: 'desc' },
      select: { id: true, status: true, createdAt: true, student: { select: { name: true, email: true } } },
    });
  }

  @Delete('requests/:id') @HttpCode(200)
  async cancel(@CurrentUser() u: AuthUser, @Param('id') id: string) {
    const r = await this.prisma.parentLinkRequest.deleteMany({ where: { id, parentId: u.id } });
    if (!r.count) throw new NotFoundException('Request not found');
    return { ok: true };
  }
}

/** The student's side: see who wants to follow their progress, and accept or decline. */
@Roles(Role.STUDENT)
@Controller('parent-requests')
class ParentRequestsController {
  constructor(private prisma: PrismaService) {}

  @Get()
  list(@CurrentUser() u: AuthUser) {
    return this.prisma.parentLinkRequest.findMany({
      where: { studentId: u.id, status: 'PENDING' }, orderBy: { createdAt: 'desc' },
      select: { id: true, createdAt: true, parent: { select: { name: true, email: true } } },
    });
  }

  @Post(':id/accept') @HttpCode(200)
  async accept(@CurrentUser() u: AuthUser, @Param('id') id: string) {
    const req = await this.prisma.parentLinkRequest.findFirst({ where: { id, studentId: u.id, status: 'PENDING' } });
    if (!req) throw new NotFoundException('Request not found');
    const me = await this.prisma.user.findUniqueOrThrow({ where: { id: u.id }, select: { parentId: true } });
    if (me.parentId) throw new ConflictException('You are already linked to a parent');
    await this.prisma.$transaction([
      this.prisma.user.update({ where: { id: u.id }, data: { parentId: req.parentId, guardianConsentAt: req.guardianConfirmedAt ?? new Date() } }),
      this.prisma.parentLinkRequest.deleteMany({ where: { studentId: u.id } }),
    ]);
    return { ok: true };
  }

  @Post(':id/decline') @HttpCode(200)
  async decline(@CurrentUser() u: AuthUser, @Param('id') id: string) {
    const r = await this.prisma.parentLinkRequest.updateMany({ where: { id, studentId: u.id, status: 'PENDING' }, data: { status: 'DECLINED' } });
    if (!r.count) throw new NotFoundException('Request not found');
    return { ok: true };
  }
}

@Module({ controllers: [ParentsController, ParentRequestsController] })
export class ParentsModule {}
