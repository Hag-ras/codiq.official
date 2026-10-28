import { BadRequestException, Body, ConflictException, Controller, Delete, Get, HttpCode, Injectable, Module, NotFoundException, Param, Patch, Post } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { Type } from 'class-transformer';
import { IsBoolean, IsDateString, IsEnum, IsInt, IsOptional, IsString, Matches, Max, Min } from 'class-validator';
import { BillingType, Coupon, CouponType, Role, Track } from '@prisma/client';
import { randomInt } from 'crypto';
import { PrismaService } from '../common/infra.module';
import { AuthUser, CurrentUser, Roles } from '../common/decorators';

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no 0/O/1/I
const randomCode = (prefix: string) => `${prefix ? prefix + '-' : ''}${Array.from({ length: 6 }, () => ALPHABET[randomInt(ALPHABET.length)]).join('')}`;

class CouponBase {
  @IsOptional() @IsString() description?: string;
  @IsEnum(CouponType) type!: CouponType;
  /** PERCENT: 1-100. FIXED: piasters. */
  @IsInt() @Min(1) value!: number;
  @IsOptional() @IsInt() @Min(1) maxRedemptions?: number;
  @IsOptional() @IsDateString() expiresAt?: string;
  @IsOptional() @IsString() packageId?: string;
  @IsOptional() @IsEnum(Track) track?: Track;
}
class CreateCouponDto extends CouponBase {
  /** Leave empty to auto-generate */
  @IsOptional() @Matches(/^[A-Za-z0-9_-]{3,32}$/, { message: 'Code: 3-32 letters, numbers, - or _' }) code?: string;
  @IsOptional() @Matches(/^[A-Za-z0-9]{1,12}$/, { message: 'Prefix: up to 12 letters or numbers' }) prefix?: string;
}
class GenerateCouponsDto extends CouponBase {
  @Type(() => Number) @IsInt() @Min(1) @Max(200) count!: number;
  @IsOptional() @Matches(/^[A-Za-z0-9]{1,12}$/, { message: 'Prefix: up to 12 letters or numbers' }) prefix?: string;
}
class UpdateCouponDto {
  @IsOptional() @IsBoolean() active?: boolean;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsInt() @Min(1) maxRedemptions?: number;
  @IsOptional() @IsDateString() expiresAt?: string;
}
class ValidateDto {
  @IsString() code!: string;
  @IsString() packageId!: string;
  @IsEnum(BillingType) billing!: BillingType;
}

export interface CouponQuote { coupon: Coupon; discount: number; final: number }

@Injectable()
export class CouponsService {
  constructor(private prisma: PrismaService) {}

  normalize(code: string) {
    return code.trim().toUpperCase();
  }

  /** Checks a code against a package and price. Throws a friendly 400 if it can't be used. */
  async quote(codeRaw: string, pkg: { id: string; track: Track }, amount: number): Promise<CouponQuote> {
    const coupon = await this.prisma.coupon.findUnique({ where: { code: this.normalize(codeRaw) } });
    if (!coupon || !coupon.active || (coupon.expiresAt && coupon.expiresAt < new Date()) || (coupon.maxRedemptions !== null && coupon.redeemedCount >= coupon.maxRedemptions))
      throw new BadRequestException("This code isn't valid or has expired");
    if ((coupon.packageId && coupon.packageId !== pkg.id) || (coupon.track && coupon.track !== pkg.track))
      throw new BadRequestException("This code doesn't apply to this package");
    const discount = coupon.type === CouponType.PERCENT ? Math.floor((amount * coupon.value) / 100) : Math.min(coupon.value, amount);
    return { coupon, discount, final: amount - discount };
  }

  /** Atomically takes one use. Fails if someone else just used the last one. */
  async reserve(couponId: string) {
    const r = await this.prisma.$executeRaw`UPDATE "Coupon" SET "redeemedCount" = "redeemedCount" + 1
      WHERE id = ${couponId} AND active = true AND ("maxRedemptions" IS NULL OR "redeemedCount" < "maxRedemptions")`;
    if (!r) throw new BadRequestException('This code has just been used up');
  }

  async release(couponId: string) {
    await this.prisma.$executeRaw`UPDATE "Coupon" SET "redeemedCount" = GREATEST("redeemedCount" - 1, 0) WHERE id = ${couponId}`;
  }

  async assertScope(dto: { packageId?: string; type: CouponType; value: number }) {
    if (dto.type === CouponType.PERCENT && dto.value > 100) throw new BadRequestException('A percentage can be 100 at most');
    if (dto.packageId && !(await this.prisma.package.findUnique({ where: { id: dto.packageId }, select: { id: true } }))) throw new NotFoundException('Package not found');
  }
}

@Roles(Role.ADMIN)
@Controller('admin/coupons')
class AdminCouponsController {
  constructor(private prisma: PrismaService, private svc: CouponsService) {}

  @Get()
  async list() {
    const [coupons, usage] = await Promise.all([
      this.prisma.coupon.findMany({ orderBy: { createdAt: 'desc' }, include: { package: { select: { name: true } } }, take: 500 }),
      this.prisma.payment.groupBy({ by: ['couponId'], where: { couponId: { not: null }, status: 'PAID' }, _count: { _all: true }, _sum: { discountAmount: true, amount: true } }),
    ]);
    const byId = new Map(usage.map((u) => [u.couponId, u]));
    return coupons.map((c) => {
      const u = byId.get(c.id);
      return { ...c, packageName: c.package?.name ?? null, package: undefined, paidCount: u?._count._all ?? 0, discountTotal: u?._sum.discountAmount ?? 0, revenueTotal: u?._sum.amount ?? 0 };
    });
  }

  @Post()
  async create(@Body() dto: CreateCouponDto) {
    await this.svc.assertScope(dto);
    const code = dto.code ? this.svc.normalize(dto.code) : randomCode((dto.prefix ?? '').toUpperCase());
    if (await this.prisma.coupon.findUnique({ where: { code } })) throw new ConflictException('That code already exists');
    const { code: _c, prefix: _p, expiresAt, ...rest } = dto;
    return this.prisma.coupon.create({ data: { ...rest, code, expiresAt: expiresAt ? new Date(expiresAt) : null } });
  }

  /** Bulk generator: N unique random codes with the same rules. */
  @Post('generate')
  async generate(@Body() dto: GenerateCouponsDto) {
    await this.svc.assertScope(dto);
    const { count, prefix, expiresAt, ...rest } = dto;
    const made: string[] = [];
    for (let attempt = 0; made.length < count && attempt < 5; attempt++) {
      const batch = [...new Set(Array.from({ length: count - made.length }, () => randomCode((prefix ?? '').toUpperCase())))];
      const r = await this.prisma.coupon.createMany({ data: batch.map((code) => ({ ...rest, code, expiresAt: expiresAt ? new Date(expiresAt) : null })), skipDuplicates: true });
      if (r.count === batch.length) made.push(...batch);
      else {
        // a collision happened: find which of this batch were actually stored
        const stored = await this.prisma.coupon.findMany({ where: { code: { in: batch } }, select: { code: true, createdAt: true } });
        made.push(...stored.filter((s) => Date.now() - s.createdAt.getTime() < 60_000).map((s) => s.code));
      }
    }
    return { count: made.length, codes: made };
  }

  @Patch(':id')
  async update(@Param('id') id: string, @Body() dto: UpdateCouponDto) {
    if (!(await this.prisma.coupon.findUnique({ where: { id } }))) throw new NotFoundException();
    const { expiresAt, ...rest } = dto;
    return this.prisma.coupon.update({ where: { id }, data: { ...rest, ...(expiresAt ? { expiresAt: new Date(expiresAt) } : {}) } });
  }

  /** Codes that were ever used by a payment are kept for the records; deactivate those instead. */
  @Delete(':id') @HttpCode(200)
  async remove(@Param('id') id: string) {
    if (await this.prisma.payment.count({ where: { couponId: id } })) throw new ConflictException('This code has been used in payments. Deactivate it instead of deleting');
    await this.prisma.coupon.delete({ where: { id } }).catch(() => { throw new NotFoundException(); });
    return { ok: true };
  }
}

/** What students and parents call from checkout to preview a discount. */
@Controller('coupons')
class CouponsController {
  constructor(private prisma: PrismaService, private svc: CouponsService) {}

  @Roles(Role.STUDENT, Role.PARENT)
  @Throttle({ default: { limit: 15, ttl: 60_000 } })
  @Post('validate') @HttpCode(200)
  async validate(@CurrentUser() _u: AuthUser, @Body() dto: ValidateDto) {
    const pkg = await this.prisma.package.findFirst({ where: { id: dto.packageId, isPublished: true } });
    if (!pkg) throw new NotFoundException('Package not found');
    const base = dto.billing === BillingType.ONE_TIME ? pkg.priceOneTime : pkg.priceMonthly;
    if (!base) throw new BadRequestException('This package has no monthly plan');
    const q = await this.svc.quote(dto.code, pkg, base);
    return {
      code: q.coupon.code, discount: q.discount, finalAmount: q.final,
      label: q.coupon.type === CouponType.PERCENT ? `${q.coupon.value}% off` : 'Discount applied',
    };
  }
}

@Module({ controllers: [AdminCouponsController, CouponsController], providers: [CouponsService], exports: [CouponsService] })
export class CouponsModule {}
