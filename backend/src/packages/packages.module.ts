import { Body, ConflictException, Controller, Delete, Get, HttpCode, Module, NotFoundException, Param, Patch, Post, Query } from '@nestjs/common';
import { PartialType } from '@nestjs/mapped-types';
import { IsBoolean, IsEnum, IsInt, IsOptional, IsString, Min, MinLength } from 'class-validator';
import { Role, Track } from '@prisma/client';
import { randomBytes } from 'crypto';
import { PrismaService } from '../common/infra.module';
import { Public, Roles } from '../common/decorators';

class CreatePackageDto {
  @IsString() @MinLength(2) name!: string;
  @IsEnum(Track) track!: Track;
  @IsString() description!: string;
  /** piasters */
  @IsInt() @Min(0) priceOneTime!: number;
  @IsOptional() @IsInt() @Min(0) priceMonthly?: number;
  @IsOptional() @IsBoolean() installmentsAllowed?: boolean;
  @IsOptional() @IsBoolean() isPublished?: boolean;
}
class UpdatePackageDto extends PartialType(CreatePackageDto) {}

const slugify = (s: string) =>
  s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') + '-' + randomBytes(2).toString('hex');

@Controller('packages')
class PackagesController {
  constructor(private prisma: PrismaService) {}

  @Public()
  @Get()
  list(@Query('track') track?: Track, @Query('all') all?: string) {
    return this.prisma.package.findMany({
      where: { ...(track ? { track } : {}), ...(all ? {} : { isPublished: true }) },
      include: { _count: { select: { sessions: true, enrollments: true } } },
      orderBy: [{ track: 'asc' }, { priceOneTime: 'asc' }],
    });
  }

  @Public()
  @Get(':idOrSlug')
  async one(@Param('idOrSlug') key: string) {
    const pkg = await this.prisma.package.findFirst({
      where: { OR: [{ id: key }, { slug: key }] },
      include: { sessions: { orderBy: { order: 'asc' }, select: { id: true, order: true, title: true, type: true, startsAt: true, durationMin: true } } },
    });
    if (!pkg) throw new NotFoundException('Package not found');
    return pkg;
  }

  @Roles(Role.ADMIN)
  @Post()
  create(@Body() dto: CreatePackageDto) {
    return this.prisma.package.create({ data: { ...dto, slug: slugify(dto.name) } });
  }

  @Roles(Role.ADMIN)
  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdatePackageDto) {
    return this.prisma.package.update({ where: { id }, data: dto });
  }

  /** Permanent delete, only for a course nobody has bought. Otherwise hide it so students keep access. */
  @Roles(Role.ADMIN)
  @Delete(':id') @HttpCode(200)
  async remove(@Param('id') id: string) {
    const pkg = await this.prisma.package.findUnique({ where: { id }, select: { id: true, _count: { select: { enrollments: true, payments: true } } } });
    if (!pkg) throw new NotFoundException('Package not found');
    if (pkg._count.enrollments || pkg._count.payments)
      throw new ConflictException(`This course has ${pkg._count.enrollments} student(s) and ${pkg._count.payments} payment(s). Hide it from the shop instead of deleting it`);
    await this.prisma.package.delete({ where: { id } });
    return { ok: true };
  }
}

@Module({ controllers: [PackagesController] })
export class PackagesModule {}
