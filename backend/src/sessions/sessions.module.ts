import { BadRequestException, Body, Controller, Delete, Get, HttpCode, Injectable, Module, NotFoundException, Param, Patch, Post, Put, Query } from '@nestjs/common';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize, ArrayMinSize, IsArray, IsDateString, IsEnum, IsInt, IsOptional, IsString, Max, Min, MinLength, ValidateNested,
} from 'class-validator';
import { Prisma, Role, SessionType } from '@prisma/client';
import { AccessService, activeEnrollment, PrismaService, StorageService } from '../common/infra.module';
import { AuthUser, CurrentUser, Roles } from '../common/decorators';
import { NotificationsService } from '../notifications/notifications.module';
import { CertificatesModule, CertificatesService } from '../certificates/certificates.module';

/** Accepts watch, youtu.be, embed, shorts and live links (or a bare 11 character id) and returns the video id. */
export function parseYoutubeId(input: string): string | null {
  const v = input.trim();
  if (/^[A-Za-z0-9_-]{11}$/.test(v)) return v;
  try {
    const u = new URL(v);
    const host = u.hostname.replace(/^www\.|^m\./, '');
    let id: string | null = null;
    if (host === 'youtu.be') id = u.pathname.slice(1).split('/')[0];
    else if (host === 'youtube.com' || host === 'youtube-nocookie.com') id = u.searchParams.get('v') ?? /^\/(?:embed|shorts|live|v)\/([^/?]+)/.exec(u.pathname)?.[1] ?? null;
    return id && /^[A-Za-z0-9_-]{11}$/.test(id) ? id : null;
  } catch {
    return null;
  }
}

class MaterialDto {
  @IsString() name!: string;
  @IsString() fileKey!: string;
  @IsInt() sizeBytes!: number;
  @IsString() mimeType!: string;
}
class AssignmentDto {
  @IsString() @MinLength(2) title!: string;
  @IsString() brief!: string;
  @IsOptional() @IsDateString() dueAt?: string;
  @IsOptional() @IsInt() @Min(1) maxScore?: number;
}
class QuestionDto {
  @IsString() @MinLength(1) text!: string;
  @IsArray() @ArrayMinSize(2) @ArrayMaxSize(6) @IsString({ each: true }) options!: string[];
  @IsInt() @Min(0) correctIndex!: number;
}
class QuizDto {
  @IsOptional() @IsString() title?: string;
  @IsOptional() @IsInt() @Min(0) @Max(100) passScore?: number;
  @IsArray() @ValidateNested({ each: true }) @Type(() => QuestionDto) questions!: QuestionDto[];
}
export class CreateSessionDto {
  @IsString() packageId!: string;
  @IsString() @MinLength(2) title!: string;
  @IsOptional() @IsString() description?: string;
  @IsEnum(SessionType) type!: SessionType;
  @IsOptional() @IsDateString() startsAt?: string;
  @IsOptional() @IsInt() @Min(5) durationMin?: number;
  @IsOptional() @IsString() instructorId?: string;
  @IsOptional() @IsString() videoKey?: string;
  /** A YouTube link (unlisted is best). Used instead of an uploaded video. */
  @IsOptional() @IsString() youtubeUrl?: string;
  @IsOptional() @IsInt() @Min(1) order?: number;
  @IsOptional() @IsArray() @ValidateNested({ each: true }) @Type(() => MaterialDto) materials?: MaterialDto[];
  @IsOptional() @ValidateNested() @Type(() => AssignmentDto) assignment?: AssignmentDto;
  @IsOptional() @ValidateNested() @Type(() => QuizDto) quiz?: QuizDto;
}
class UpdateSessionDto {
  @IsOptional() @IsString() title?: string;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsDateString() startsAt?: string;
  @IsOptional() @IsInt() durationMin?: number;
  @IsOptional() @IsString() instructorId?: string;
  @IsOptional() @IsString() videoKey?: string;
  /** Empty string removes the YouTube video */
  @IsOptional() @IsString() youtubeUrl?: string;
}
class ProgressDto {
  @IsInt() @Min(0) watchedSeconds!: number;
  /** Where the video was left (so it resumes there). Defaults to watchedSeconds. */
  @IsOptional() @IsInt() @Min(0) positionSeconds?: number;
  @IsOptional() completed?: boolean;
}

@Injectable()
export class SessionsService {
  constructor(private prisma: PrismaService, private access: AccessService, private storage: StorageService, private notify: NotificationsService, private certs: CertificatesService) {}

  private summary(s: any, now = new Date()) {
    const start: Date | null = s.startsAt;
    const end = start ? new Date(start.getTime() + s.durationMin * 60_000) : null;
    return {
      id: s.id, order: s.order, title: s.title, type: s.type, startsAt: s.startsAt, durationMin: s.durationMin,
      packageId: s.packageId, packageName: s.package?.name, instructorName: s.instructor?.name ?? null,
      hasRecording: !!s.videoKey || !!s.youtubeId,
      isLiveNow: s.type === 'LIVE' && !s.endedAt && !!start && now.getTime() >= start.getTime() - 15 * 60_000 && now <= end!,
      completed: s.progress?.[0]?.completed ?? false,
      dueAt: s.assignment?.dueAt ?? null,
      submission: s.assignment?.submissions?.[0] ?? null,
      quizScore: s.quiz?.attempts?.[0]?.score ?? null,
      pendingSubmissions: s.assignment?._count?.submissions ?? 0,
    };
  }

  async mine(user: AuthUser) {
    if (user.role === Role.STUDENT) {
      const enrollments = await this.prisma.enrollment.findMany({
        where: { userId: user.id, ...activeEnrollment() },
        include: { package: { select: { id: true, name: true, track: true } } },
      });
      const sessions = await this.prisma.session.findMany({
        where: { packageId: { in: enrollments.map((e) => e.packageId) } },
        orderBy: [{ packageId: 'asc' }, { order: 'asc' }],
        include: {
          package: { select: { name: true } },
          instructor: { select: { name: true } },
          progress: { where: { userId: user.id } },
          assignment: { select: { dueAt: true, submissions: { where: { studentId: user.id }, select: { status: true, score: true } } } },
          quiz: { select: { attempts: { where: { studentId: user.id }, orderBy: { score: 'desc' }, take: 1, select: { score: true } } } },
        },
      });
      return {
        packages: enrollments.map((e) => ({ ...e.package, billing: e.billing, activeUntil: e.activeUntil })),
        sessions: sessions.map((s) => this.summary(s)),
      };
    }
    const where: Prisma.SessionWhereInput = user.role === Role.INSTRUCTOR ? { instructorId: user.id } : {};
    const sessions = await this.prisma.session.findMany({
      where,
      orderBy: [{ startsAt: 'desc' }],
      include: {
        package: { select: { name: true } },
        instructor: { select: { name: true } },
        assignment: { select: { dueAt: true, _count: { select: { submissions: { where: { status: 'SUBMITTED' } } } } } },
      },
    });
    return { packages: [], sessions: sessions.map((s) => this.summary(s)) };
  }

  async detail(user: AuthUser, id: string) {
    await this.access.assertSessionAccess(user, id);
    const isStudent = user.role === Role.STUDENT;
    const s = await this.prisma.session.findUniqueOrThrow({
      where: { id },
      include: {
        package: { select: { id: true, name: true, track: true } },
        instructor: { select: { id: true, name: true } },
        materials: { select: { id: true, name: true, sizeBytes: true, mimeType: true } },
        assignment: { include: { submissions: isStudent ? { where: { studentId: user.id } } : false } },
        quiz: {
          include: {
            questions: { orderBy: { order: 'asc' } },
            attempts: isStudent ? { where: { studentId: user.id }, orderBy: { createdAt: 'desc' }, take: 1 } : false,
          },
        },
      },
    });
    const mine = isStudent ? await this.prisma.sessionProgress.findUnique({ where: { userId_sessionId: { userId: user.id, sessionId: id } }, select: { positionSeconds: true } }) : null;
    const attempted = !!(s.quiz as any)?.attempts?.length;
    const showAnswers = !isStudent || attempted;
    return {
      ...this.summary(s),
      youtubeId: s.youtubeId ?? null,
      resumeAt: mine?.positionSeconds ?? 0,
      description: s.description,
      package: s.package,
      instructor: s.instructor,
      materials: s.materials,
      assignment: s.assignment && {
        id: s.assignment.id, title: s.assignment.title, brief: s.assignment.brief, dueAt: s.assignment.dueAt, maxScore: s.assignment.maxScore,
        mySubmission: (s.assignment as any).submissions?.[0] ?? null,
      },
      quiz: s.quiz && {
        id: s.quiz.id, title: s.quiz.title, passScore: s.quiz.passScore,
        lastAttempt: (s.quiz as any).attempts?.[0] ?? null,
        questions: s.quiz.questions.map((q) => ({ id: q.id, text: q.text, options: q.options, ...(showAnswers ? { correctIndex: q.correctIndex } : {}) })),
      },
    };
  }

  async create(dto: CreateSessionDto) {
    if (!(await this.prisma.package.findUnique({ where: { id: dto.packageId } }))) throw new NotFoundException('Package not found');
    if (dto.type === 'LIVE' && !dto.startsAt) throw new BadRequestException('Live sessions need a start time');
    let youtubeId: string | null = null;
    if (dto.youtubeUrl?.trim()) {
      youtubeId = parseYoutubeId(dto.youtubeUrl);
      if (!youtubeId) throw new BadRequestException('That does not look like a YouTube link');
    }
    dto.quiz?.questions.forEach((q, i) => {
      if (q.correctIndex >= q.options.length) throw new BadRequestException(`Question ${i + 1}: pick a correct answer`);
    });
    const order =
      dto.order ?? ((await this.prisma.session.aggregate({ where: { packageId: dto.packageId }, _max: { order: true } }))._max.order ?? 0) + 1;
    const created = await this.prisma.session.create({
      data: {
        packageId: dto.packageId, order, title: dto.title, description: dto.description, type: dto.type,
        startsAt: dto.startsAt ? new Date(dto.startsAt) : null, durationMin: dto.durationMin ?? 60,
        instructorId: dto.instructorId, videoKey: dto.videoKey, youtubeId,
        materials: dto.materials?.length ? { create: dto.materials } : undefined,
        assignment: dto.assignment
          ? { create: { ...dto.assignment, dueAt: dto.assignment.dueAt ? new Date(dto.assignment.dueAt) : null } }
          : undefined,
        quiz: dto.quiz?.questions.length
          ? {
              create: {
                title: dto.quiz.title ?? `${dto.title} quiz`,
                passScore: dto.quiz.passScore ?? 60,
                questions: { create: dto.quiz.questions.map((q, i) => ({ ...q, order: i + 1 })) },
              },
            }
          : undefined,
      },
      include: { assignment: { select: { id: true } } },
    });
    if (created.assignment) void this.notify.assignmentPosted(created.assignment.id).catch(() => null);
    return created;
  }

  async update(user: AuthUser, id: string, dto: UpdateSessionDto) {
    await this.access.assertSessionAccess(user, id); // an instructor can only edit their own sessions
    // Who teaches a session is the admin's decision
    if (user.role !== Role.ADMIN) delete dto.instructorId;
    if (dto.videoKey && !dto.videoKey.startsWith('recording/')) throw new BadRequestException('Invalid video file');
    const { youtubeUrl, ...rest } = dto;
    let youtubeId: string | null | undefined;
    if (youtubeUrl !== undefined) {
      youtubeId = youtubeUrl.trim() ? parseYoutubeId(youtubeUrl) : null;
      if (youtubeUrl.trim() && !youtubeId) throw new BadRequestException('That does not look like a YouTube link');
    }
    return this.prisma.session.update({ where: { id }, data: { ...rest, ...(youtubeId !== undefined ? { youtubeId } : {}), startsAt: dto.startsAt ? new Date(dto.startsAt) : undefined } });
  }

  async addMaterial(user: AuthUser, id: string, dto: MaterialDto) {
    await this.access.assertSessionAccess(user, id); // instructors only for their own sessions
    if (!dto.fileKey.startsWith('material/')) throw new BadRequestException('Invalid file'); // never point a material at someone else's upload
    await this.prisma.session.findUniqueOrThrow({ where: { id }, select: { id: true } }).catch(() => { throw new NotFoundException('Session not found'); });
    return this.prisma.material.create({ data: { ...dto, sessionId: id } });
  }

  async removeMaterial(id: string, materialId: string) {
    const r = await this.prisma.material.deleteMany({ where: { id: materialId, sessionId: id } });
    if (!r.count) throw new NotFoundException('Material not found');
  }

  async saveAssignment(id: string, dto: AssignmentDto) {
    const data = { title: dto.title, brief: dto.brief, dueAt: dto.dueAt ? new Date(dto.dueAt) : null, maxScore: dto.maxScore ?? 10 };
    const existed = await this.prisma.assignment.findUnique({ where: { sessionId: id }, select: { id: true } });
    const saved = await this.prisma.assignment.upsert({ where: { sessionId: id }, create: { sessionId: id, ...data }, update: data });
    if (!existed) void this.notify.assignmentPosted(saved.id).catch(() => null); // parents hear about new assignments, not edits
    return saved;
  }

  async removeAssignment(id: string) {
    await this.prisma.assignment.deleteMany({ where: { sessionId: id } });
  }

  /** Replaces the quiz questions. Earlier attempts are kept, but their answers refer to the old question order. */
  async saveQuiz(id: string, dto: QuizDto) {
    const session = await this.prisma.session.findUnique({ where: { id }, select: { title: true } });
    if (!session) throw new NotFoundException('Session not found');
    if (!dto.questions.length) throw new BadRequestException('Add at least one question');
    dto.questions.forEach((q, i) => {
      if (q.correctIndex >= q.options.length) throw new BadRequestException(`Question ${i + 1}: pick a correct answer`);
    });
    return this.prisma.$transaction(async (tx) => {
      const quiz = await tx.quiz.upsert({
        where: { sessionId: id },
        create: { sessionId: id, title: dto.title || `${session.title} quiz`, passScore: dto.passScore ?? 60 },
        update: { ...(dto.title ? { title: dto.title } : {}), ...(dto.passScore !== undefined ? { passScore: dto.passScore } : {}) },
      });
      await tx.quizQuestion.deleteMany({ where: { quizId: quiz.id } });
      await tx.quizQuestion.createMany({ data: dto.questions.map((q, i) => ({ quizId: quiz.id, order: i + 1, text: q.text, options: q.options, correctIndex: q.correctIndex })) });
      return quiz;
    });
  }

  async removeQuiz(id: string) {
    await this.prisma.quiz.deleteMany({ where: { sessionId: id } });
  }

  async recordingUrl(user: AuthUser, id: string) {
    await this.access.assertSessionAccess(user, id);
    const s = await this.prisma.session.findUniqueOrThrow({ where: { id }, select: { videoKey: true, youtubeId: true } });
    if (s.youtubeId) return { youtubeId: s.youtubeId };
    if (!s.videoKey) throw new NotFoundException('No recording yet');
    return { url: await this.storage.downloadUrl(s.videoKey) };
  }

  async progress(user: AuthUser, id: string, dto: ProgressDto) {
    const session = await this.access.assertSessionAccess(user, id);
    const where = { userId_sessionId: { userId: user.id, sessionId: id } };
    const old = await this.prisma.sessionProgress.findUnique({ where, select: { watchedSeconds: true } });
    const position = dto.positionSeconds ?? dto.watchedSeconds;
    const saved = await this.prisma.sessionProgress.upsert({
      where,
      create: { userId: user.id, sessionId: id, watchedSeconds: dto.watchedSeconds, positionSeconds: position, completed: !!dto.completed },
      // Watching the start again must not lower the total watched time
      update: { watchedSeconds: Math.max(old?.watchedSeconds ?? 0, dto.watchedSeconds), positionSeconds: position, ...(dto.completed ? { completed: true } : {}) },
    });
    if (dto.completed) void this.certs.tryIssue(user.id, session.packageId).catch(() => null); // finishing the last lesson earns the certificate
    return saved;
  }
}

@Controller('sessions')
class SessionsController {
  constructor(private sessions: SessionsService, private prisma: PrismaService, private access: AccessService) {}

  @Get('mine') mine(@CurrentUser() u: AuthUser) { return this.sessions.mine(u); }

  @Roles(Role.ADMIN)
  @Get()
  all(@Query('packageId') packageId?: string) {
    return this.prisma.session.findMany({
      where: packageId ? { packageId } : {},
      orderBy: [{ packageId: 'asc' }, { order: 'asc' }],
      include: { package: { select: { name: true } }, instructor: { select: { name: true } }, _count: { select: { materials: true } } },
    });
  }

  @Get(':id') detail(@CurrentUser() u: AuthUser, @Param('id') id: string) { return this.sessions.detail(u, id); }

  @Get(':id/recording') recording(@CurrentUser() u: AuthUser, @Param('id') id: string) { return this.sessions.recordingUrl(u, id); }

  @Roles(Role.STUDENT)
  @Post(':id/progress') @HttpCode(200)
  progress(@CurrentUser() u: AuthUser, @Param('id') id: string, @Body() dto: ProgressDto) { return this.sessions.progress(u, id, dto); }

  @Roles(Role.ADMIN)
  @Post() create(@Body() dto: CreateSessionDto) { return this.sessions.create(dto); }

  @Roles(Role.ADMIN, Role.INSTRUCTOR)
  @Patch(':id') update(@CurrentUser() u: AuthUser, @Param('id') id: string, @Body() dto: UpdateSessionDto) { return this.sessions.update(u, id, dto); }

  /** Instructors can add files to their own sessions (for example slides shared in a live class). */
  @Roles(Role.ADMIN, Role.INSTRUCTOR)
  @Post(':id/materials') addMaterial(@CurrentUser() u: AuthUser, @Param('id') id: string, @Body() dto: MaterialDto) { return this.sessions.addMaterial(u, id, dto); }

  // Content of a session (materials, assignment, quiz) is managed by an admin or by the instructor who teaches it.
  // assertSessionAccess lets an instructor through only for their own sessions.
  @Roles(Role.ADMIN, Role.INSTRUCTOR)
  @Delete(':id/materials/:materialId') @HttpCode(204)
  async removeMaterial(@CurrentUser() u: AuthUser, @Param('id') id: string, @Param('materialId') materialId: string) {
    await this.access.assertSessionAccess(u, id);
    return this.sessions.removeMaterial(id, materialId);
  }

  @Roles(Role.ADMIN, Role.INSTRUCTOR)
  @Put(':id/assignment') async saveAssignment(@CurrentUser() u: AuthUser, @Param('id') id: string, @Body() dto: AssignmentDto) {
    await this.access.assertSessionAccess(u, id);
    return this.sessions.saveAssignment(id, dto);
  }

  @Roles(Role.ADMIN, Role.INSTRUCTOR)
  @Delete(':id/assignment') @HttpCode(204)
  async removeAssignment(@CurrentUser() u: AuthUser, @Param('id') id: string) {
    await this.access.assertSessionAccess(u, id);
    return this.sessions.removeAssignment(id);
  }

  @Roles(Role.ADMIN, Role.INSTRUCTOR)
  @Put(':id/quiz') async saveQuiz(@CurrentUser() u: AuthUser, @Param('id') id: string, @Body() dto: QuizDto) {
    await this.access.assertSessionAccess(u, id);
    return this.sessions.saveQuiz(id, dto);
  }

  @Roles(Role.ADMIN, Role.INSTRUCTOR)
  @Delete(':id/quiz') @HttpCode(204)
  async removeQuiz(@CurrentUser() u: AuthUser, @Param('id') id: string) {
    await this.access.assertSessionAccess(u, id);
    return this.sessions.removeQuiz(id);
  }

  @Roles(Role.ADMIN)
  @Delete(':id') @HttpCode(204)
  async remove(@Param('id') id: string) { await this.prisma.session.delete({ where: { id } }); }
}

@Module({ imports: [CertificatesModule], controllers: [SessionsController], providers: [SessionsService], exports: [SessionsService] })
export class SessionsModule {}
