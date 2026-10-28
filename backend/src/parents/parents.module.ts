import { Body, ConflictException, Controller, Get, Module, Post } from '@nestjs/common';
import { IsEmail, IsEnum, IsString, MinLength } from 'class-validator';
import { Role, Track } from '@prisma/client';
import * as argon2 from 'argon2';
import { activeEnrollment, PrismaService } from '../common/infra.module';
import { AuthUser, CurrentUser, Roles } from '../common/decorators';

class AddChildDto {
  @IsString() @MinLength(2) name!: string;
  @IsEmail() email!: string;
  @IsString() @MinLength(8) password!: string;
  @IsEnum(Track) track!: Track;
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

  @Post()
  async add(@CurrentUser() u: AuthUser, @Body() dto: AddChildDto) {
    const email = dto.email.toLowerCase();
    if (await this.prisma.user.findUnique({ where: { email } })) throw new ConflictException('Email already in use');
    return this.prisma.user.create({
      data: { name: dto.name, email, track: dto.track, role: Role.STUDENT, parentId: u.id, passwordHash: await argon2.hash(dto.password) },
      select: { id: true, name: true, email: true, track: true },
    });
  }
}

@Module({ controllers: [ParentsController] })
export class ParentsModule {}
