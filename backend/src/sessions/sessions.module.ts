import { BadRequestException, Body, Controller, Delete, Get, HttpCode, Injectable, Module, NotFoundException, Param, Patch, Post, Query } from '@nestjs/common';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize, ArrayMinSize, IsArray, IsDateString, IsEnum, IsInt, IsOptional, IsString, Max, Min, MinLength, ValidateNested,
} from 'class-validator';
import { Prisma, Role, SessionType } from '@prisma/client';
import { AccessService, activeEnrollment, PrismaService, StorageService } from '../common/infra.module';
import { AuthUser, CurrentUser, Roles } from '../common/decorators';

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
  @IsOptional() completed?: boolean;
}

@Injectable()
export class SessionsService {
  constructor(private prisma: PrismaService, private access: AccessService, private storage: StorageService) {}

  private summary(s: any, now = new Date()) {
    const start: Date | null = s.startsAt;
    const end = start ? new Date(start.getTime() + s.durationMin * 60_000) : null;
    return {
      id: s.id, order: s.order, title: s.title, type: s.type, startsAt: s.startsAt, durationMin: s.durationMin,
      packageId: s.packageId, packageName: s.package?.name, instructorName: s.instructor?.name ?? null,
      hasRecording: !!s.videoKey || !!s.youtubeId,
      isLiveNow: s.type === 'LIVE' && !!start && now.getTime() >= start.getTime() - 15 * 60_000 && now <= end!,
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
    const attempted = !!(s.quiz as any)?.attempts?.length;
    const showAnswers = !isStudent || attempted;
    return {
      ...this.summary(s),
      youtubeId: s.youtubeId ?? null,
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
    return this.prisma.session.create({
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
    });
  }

  update(id: string, dto: UpdateSessionDto) {
    const { youtubeUrl, ...rest } = dto;
    let youtubeId: string | null | undefined;
    if (youtubeUrl !== undefined) {
      youtubeId = youtubeUrl.trim() ? parseYoutubeId(youtubeUrl) : null;
      if (youtubeUrl.trim() && !youtubeId) throw new BadRequestException('That does not look like a YouTube link');
    }
    return this.prisma.session.update({ where: { id }, data: { ...rest, ...(youtubeId !== undefined ? { youtubeId } : {}), startsAt: dto.startsAt ? new Date(dto.startsAt) : undefined } });
  }

  async recordingUrl(user: AuthUser, id: string) {
    await this.access.assertSessionAccess(user, id);
    const s = await this.prisma.session.findUniqueOrThrow({ where: { id }, select: { videoKey: true, youtubeId: true } });
    if (s.youtubeId) return { youtubeId: s.youtubeId };
    if (!s.videoKey) throw new NotFoundException('No recording yet');
    return { url: await this.storage.downloadUrl(s.videoKey) };
  }

  async progress(user: AuthUser, id: string, dto: ProgressDto) {
    await this.access.assertSessionAccess(user, id);
    return this.prisma.sessionProgress.upsert({
      where: { userId_sessionId: { userId: user.id, sessionId: id } },
      create: { userId: user.id, sessionId: id, watchedSeconds: dto.watchedSeconds, completed: !!dto.completed },
      update: { watchedSeconds: dto.watchedSeconds, ...(dto.completed ? { completed: true } : {}) },
    });
  }
}

@Controller('sessions')
class SessionsController {
  constructor(private sessions: SessionsService, private prisma: PrismaService) {}

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

  @Roles(Role.ADMIN)
  @Patch(':id') update(@Param('id') id: string, @Body() dto: UpdateSessionDto) { return this.sessions.update(id, dto); }

  @Roles(Role.ADMIN)
  @Delete(':id') @HttpCode(204)
  async remove(@Param('id') id: string) { await this.prisma.session.delete({ where: { id } }); }
}

@Module({ controllers: [SessionsController], providers: [SessionsService], exports: [SessionsService] })
export class SessionsModule {}
