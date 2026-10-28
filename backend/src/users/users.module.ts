import { BadRequestException, Body, ConflictException, Controller, Delete, Get, HttpCode, Logger, Module, NotFoundException, Param, Patch, Post, Query } from '@nestjs/common';
import { IsEmail, IsEnum, IsOptional, IsString, Matches, MinLength } from 'class-validator';
import { Role, Track } from '@prisma/client';
import * as argon2 from 'argon2';
import { PrismaService, StorageService } from '../common/infra.module';
import { avatarSrc } from '../common/avatar';
import { EG_MOBILE } from '../auth/dto';
import { AuthUser, CurrentUser, Roles } from '../common/decorators';

class CreateUserDto {
  @IsString() @MinLength(2) name!: string;
  @IsEmail() email!: string;
  @IsString() @MinLength(8) password!: string;
  @IsEnum(Role) role!: Role;
  @IsOptional() @IsEnum(Track) track?: Track;
}
class UpdateUserDto {
  @IsOptional() @IsString() @MinLength(2) name?: string;
  @IsOptional() @IsEmail() email?: string;
  @IsOptional() @Matches(EG_MOBILE, { message: 'Enter an Egyptian mobile number like 01012345678' }) phone?: string;
  @IsOptional() @IsEnum(Track) track?: Track;
  /** Admin-set new password (the user is logged out everywhere) */
  @IsOptional() @IsString() @MinLength(8) newPassword?: string;
}
class ChangeRoleDto {
  @IsEnum(Role) role!: Role;
}

const select = {
  id: true, name: true, email: true, phone: true, role: true, track: true, createdAt: true, avatarKey: true, avatarUrl: true,
  _count: { select: { enrollments: true } },
};
const shape = <T extends { id: string; avatarKey: string | null; avatarUrl: string | null }>(u: T) => {
  const { avatarKey, avatarUrl, ...rest } = u;
  return { ...rest, avatar: avatarSrc({ id: u.id, avatarKey, avatarUrl }) };
};

@Roles(Role.ADMIN)
@Controller('users')
class UsersController {
  private log = new Logger('Admin');
  constructor(private prisma: PrismaService, private storage: StorageService) {}

  @Get()
  async list(@Query('role') role?: Role, @Query('q') q?: string) {
    return (await this.prisma.user.findMany({
      where: {
        ...(role ? { role } : {}),
        ...(q ? { OR: [{ name: { contains: q, mode: 'insensitive' } }, { email: { contains: q, mode: 'insensitive' } }] } : {}),
      },
      select,
      orderBy: { createdAt: 'desc' },
      take: 200,
    })).map(shape);
  }

  @Post()
  async create(@CurrentUser() admin: AuthUser, @Body() dto: CreateUserDto) {
    if (dto.role === Role.ADMIN) new Logger('Admin').warn(`${admin.email} is creating an admin account for ${dto.email}`);
    const email = dto.email.toLowerCase();
    if (await this.prisma.user.findUnique({ where: { email } })) throw new ConflictException('Email already in use');
    return shape(await this.prisma.user.create({
      data: { name: dto.name, email, role: dto.role, track: dto.track, passwordHash: await argon2.hash(dto.password) },
      select,
    }));
  }

  /** Clearing the refresh token forces a fresh login so the new role takes effect. */
  @Patch(':id/role')
  async changeRole(@CurrentUser() admin: AuthUser, @Param('id') id: string, @Body() dto: ChangeRoleDto) {
    if (id === admin.id && dto.role !== Role.ADMIN) throw new BadRequestException("You can't remove your own admin access. Ask another admin to do it");
    const target = await this.prisma.user.findUnique({ where: { id }, select: { role: true, email: true } });
    if (target?.role === Role.ADMIN && dto.role !== Role.ADMIN && (await this.prisma.user.count({ where: { role: Role.ADMIN } })) <= 1)
      throw new BadRequestException('There must always be at least one admin');
    this.log.warn(`${admin.email} changed ${target?.email} (${id}) from ${target?.role} to ${dto.role}`);
    return shape(await this.prisma.user.update({ where: { id }, data: { role: dto.role, refreshTokenHash: null }, select }));
  }

  /** Edit a user's details. Changing the password (or email) logs them out everywhere. */
  @Patch(':id')
  async update(@CurrentUser() admin: AuthUser, @Param('id') id: string, @Body() dto: UpdateUserDto) {
    const target = await this.prisma.user.findUnique({ where: { id }, select: { email: true } });
    if (!target) throw new NotFoundException('User not found');
    const email = dto.email?.toLowerCase();
    if (email && email !== target.email && (await this.prisma.user.findUnique({ where: { email } }))) throw new ConflictException('Email already in use');
    const { newPassword, email: _e, ...rest } = dto;
    const forceLogout = !!newPassword || (!!email && email !== target.email);
    this.log.warn(`${admin.email} edited ${target.email} (${id}): ${Object.keys(dto).join(', ')}`);
    return shape(
      await this.prisma.user.update({
        where: { id },
        data: { ...rest, ...(email ? { email } : {}), ...(newPassword ? { passwordHash: await argon2.hash(newPassword) } : {}), ...(forceLogout ? { refreshTokenHash: null } : {}) },
        select,
      }),
    );
  }

  /**
   * Permanently deletes a user and their learning data (enrollments, progress, submissions, quiz attempts).
   * Users with payment records can't be deleted, because those records must be kept for accounting.
   */
  @Delete(':id') @HttpCode(200)
  async remove(@CurrentUser() admin: AuthUser, @Param('id') id: string) {
    if (id === admin.id) throw new BadRequestException("You can't delete your own account");
    const target = await this.prisma.user.findUnique({ where: { id }, select: { email: true, role: true, avatarKey: true } });
    if (!target) throw new NotFoundException('User not found');
    if (target.role === Role.ADMIN && (await this.prisma.user.count({ where: { role: Role.ADMIN } })) <= 1) throw new BadRequestException('There must always be at least one admin');
    const payments = await this.prisma.payment.count({ where: { OR: [{ payerId: id }, { studentId: id }] } });
    if (payments) throw new ConflictException(`${target.email} has ${payments} payment record(s), which must be kept. Change their role or edit them instead of deleting`);
    await this.prisma.$transaction([
      this.prisma.session.updateMany({ where: { instructorId: id }, data: { instructorId: null } }),
      this.prisma.user.updateMany({ where: { parentId: id }, data: { parentId: null } }),
      this.prisma.user.delete({ where: { id } }),
    ]);
    if (target.avatarKey) await this.storage.remove(target.avatarKey);
    this.log.warn(`${admin.email} DELETED ${target.email} (${id}, ${target.role})`);
    return { ok: true };
  }
}

@Module({ controllers: [UsersController] })
export class UsersModule {}
