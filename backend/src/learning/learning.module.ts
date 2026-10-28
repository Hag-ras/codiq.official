import { BadRequestException, Body, Controller, ForbiddenException, Get, HttpCode, Module, NotFoundException, Param, Patch, Post, Query } from '@nestjs/common';
import { IsArray, IsIn, IsInt, IsOptional, IsString, Min } from 'class-validator';
import { Role, SubmissionStatus } from '@prisma/client';
import { randomUUID } from 'crypto';
import { AccessService, PrismaService, StorageService } from '../common/infra.module';
import { AuthUser, CurrentUser, Roles } from '../common/decorators';

class SubmitDto {
  @IsOptional() @IsString() text?: string;
  @IsOptional() @IsString() fileKey?: string;
  @IsOptional() @IsString() fileName?: string;
}
class GradeDto {
  @IsInt() @Min(0) score!: number;
  @IsOptional() @IsString() feedback?: string;
}
class AttemptDto {
  @IsArray() @IsInt({ each: true }) answers!: number[];
}
const PURPOSES = ['material', 'recording', 'submission', 'receipt', 'avatar'] as const;
class PresignDto {
  @IsIn(PURPOSES) purpose!: (typeof PURPOSES)[number];
  @IsString() fileName!: string;
  @IsString() contentType!: string;
}

@Controller()
class LearningController {
  constructor(private prisma: PrismaService, private access: AccessService, private storage: StorageService) {}

  /** Browser uploads go straight to storage with a short-lived signed URL. */
  @Post('uploads/presign') @HttpCode(200)
  async presign(@CurrentUser() u: AuthUser, @Body() dto: PresignDto) {
    if ((dto.purpose === 'material' || dto.purpose === 'recording') && !this.access.isStaff(u)) throw new ForbiddenException();
    if (dto.purpose === 'submission' && u.role !== Role.STUDENT) throw new ForbiddenException();
    if (dto.purpose === 'avatar' && !/^image\/(jpeg|png|webp)$/.test(dto.contentType)) throw new BadRequestException('Profile pictures must be JPEG, PNG or WebP');
    const safe = dto.fileName.replace(/[^\w.\-]+/g, '_').slice(-80);
    const key = `${dto.purpose}/${u.id}/${randomUUID()}-${safe}`;
    return { key, url: await this.storage.uploadUrl(key, dto.contentType) };
  }

  @Get('materials/:id/download')
  async material(@CurrentUser() u: AuthUser, @Param('id') id: string) {
    const m = await this.prisma.material.findUnique({ where: { id } });
    if (!m) throw new NotFoundException();
    await this.access.assertSessionAccess(u, m.sessionId);
    return { url: await this.storage.downloadUrl(m.fileKey, m.name) };
  }

  @Roles(Role.STUDENT)
  @Post('sessions/:id/submissions')
  async submit(@CurrentUser() u: AuthUser, @Param('id') sessionId: string, @Body() dto: SubmitDto) {
    await this.access.assertSessionAccess(u, sessionId);
    if (!dto.text?.trim() && !dto.fileKey) throw new BadRequestException('Write an answer or attach a file');
    if (dto.fileKey && !dto.fileKey.startsWith(`submission/${u.id}/`)) throw new ForbiddenException();
    const a = await this.prisma.assignment.findUnique({ where: { sessionId } });
    if (!a) throw new NotFoundException('This session has no assignment');
    const existing = await this.prisma.submission.findUnique({ where: { assignmentId_studentId: { assignmentId: a.id, studentId: u.id } } });
    if (existing?.status === SubmissionStatus.GRADED) throw new BadRequestException('Already graded');
    return this.prisma.submission.upsert({
      where: { assignmentId_studentId: { assignmentId: a.id, studentId: u.id } },
      create: { assignmentId: a.id, studentId: u.id, ...dto },
      update: { ...dto, submittedAt: new Date() },
    });
  }

  @Roles(Role.INSTRUCTOR, Role.ADMIN, Role.ASSISTANT)
  @Get('submissions')
  submissions(@CurrentUser() u: AuthUser, @Query('status') status?: SubmissionStatus) {
    return this.prisma.submission.findMany({
      where: {
        ...(status ? { status } : {}),
        ...(u.role === Role.INSTRUCTOR ? { assignment: { session: { instructorId: u.id } } } : {}),
      },
      orderBy: { submittedAt: 'asc' },
      include: {
        student: { select: { name: true } },
        assignment: { select: { title: true, maxScore: true, session: { select: { id: true, title: true, package: { select: { name: true } } } } } },
      },
    });
  }

  @Get('submissions/:id/file')
  async submissionFile(@CurrentUser() u: AuthUser, @Param('id') id: string) {
    const s = await this.prisma.submission.findUnique({ where: { id }, include: { assignment: { select: { sessionId: true } } } });
    if (!s?.fileKey) throw new NotFoundException();
    if (s.studentId !== u.id) await this.assertStaffFor(u, s.assignment.sessionId);
    return { url: await this.storage.downloadUrl(s.fileKey, s.fileName ?? undefined) };
  }

  @Roles(Role.INSTRUCTOR, Role.ADMIN, Role.ASSISTANT)
  @Patch('submissions/:id/grade')
  async grade(@CurrentUser() u: AuthUser, @Param('id') id: string, @Body() dto: GradeDto) {
    const s = await this.prisma.submission.findUnique({ where: { id }, include: { assignment: true } });
    if (!s) throw new NotFoundException();
    await this.assertStaffFor(u, s.assignment.sessionId);
    if (dto.score > s.assignment.maxScore) throw new BadRequestException(`Max score is ${s.assignment.maxScore}`);
    return this.prisma.submission.update({ where: { id }, data: { ...dto, status: SubmissionStatus.GRADED, gradedAt: new Date() } });
  }

  @Roles(Role.STUDENT)
  @Post('sessions/:id/quiz/attempts')
  async attempt(@CurrentUser() u: AuthUser, @Param('id') sessionId: string, @Body() dto: AttemptDto) {
    await this.access.assertSessionAccess(u, sessionId);
    const quiz = await this.prisma.quiz.findUnique({ where: { sessionId }, include: { questions: { orderBy: { order: 'asc' } } } });
    if (!quiz) throw new NotFoundException('This session has no quiz');
    if (dto.answers.length !== quiz.questions.length) throw new BadRequestException('Answer every question');
    const right = quiz.questions.filter((q, i) => q.correctIndex === dto.answers[i]).length;
    const score = Math.round((right / quiz.questions.length) * 100);
    await this.prisma.quizAttempt.create({ data: { quizId: quiz.id, studentId: u.id, answers: dto.answers, score } });
    return { score, passed: score >= quiz.passScore, correct: quiz.questions.map((q) => q.correctIndex) };
  }

  private async assertStaffFor(u: AuthUser, sessionId: string) {
    if (u.role === Role.ADMIN || u.role === Role.ASSISTANT) return;
    const s = await this.prisma.session.findUnique({ where: { id: sessionId }, select: { instructorId: true } });
    if (u.role !== Role.INSTRUCTOR || s?.instructorId !== u.id) throw new ForbiddenException();
  }
}

@Module({ controllers: [LearningController] })
export class LearningModule {}
