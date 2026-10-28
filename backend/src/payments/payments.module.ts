import {
  BadRequestException, Body, Controller, ForbiddenException, Get, HttpCode, Injectable, Logger, Module, NotFoundException, Param, Patch, Post, Query, UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { IsEnum, IsOptional, IsString } from 'class-validator';
import { BillingType, PaymentMethod, PaymentStatus, Prisma, Role } from '@prisma/client';
import { MailService, PrismaService, StorageService } from '../common/infra.module';
import { paymentReceiptMail } from '../common/mail-templates';
import { CouponsModule, CouponsService } from '../coupons/coupons.module';
import { AuthUser, CurrentUser, Public, Roles } from '../common/decorators';
import { FawryProvider, PaymobProvider } from './providers';

class CheckoutDto {
  @IsString() packageId!: string;
  @IsEnum(BillingType) billing!: BillingType;
  @IsEnum(PaymentMethod) method!: PaymentMethod;
  /** Required when a parent pays for a child */
  @IsOptional() @IsString() studentId?: string;
  @IsOptional() @IsString() couponCode?: string;
}
class InstapayReceiptDto {
  @IsString() receiptKey!: string;
  @IsString() senderReference!: string;
}

const DAY = 86_400_000;

@Injectable()
export class PaymentsService {
  private log = new Logger('Payments');
  constructor(
    private prisma: PrismaService,
    private paymob: PaymobProvider,
    private fawry: FawryProvider,
    private config: ConfigService,
    private mail: MailService,
    private coupons: CouponsService,
  ) {}

  async checkout(user: AuthUser, dto: CheckoutDto) {
    const pkg = await this.prisma.package.findFirst({ where: { id: dto.packageId, isPublished: true } });
    if (!pkg) throw new NotFoundException('Package not found');

    let studentId = user.id;
    if (user.role === Role.PARENT) {
      if (!dto.studentId) throw new BadRequestException('Choose which child this is for');
      const child = await this.prisma.user.findFirst({ where: { id: dto.studentId, parentId: user.id } });
      if (!child) throw new ForbiddenException('That child is not linked to your account');
      studentId = child.id;
    } else if (user.role !== Role.STUDENT) {
      throw new ForbiddenException('Only students and parents can buy packages');
    }

    if (dto.billing === BillingType.MONTHLY && !pkg.priceMonthly) throw new BadRequestException('This package has no monthly plan');
    if (dto.method === PaymentMethod.INSTALLMENTS && (dto.billing !== BillingType.ONE_TIME || !pkg.installmentsAllowed))
      throw new BadRequestException('Installments are only available on one-time payment for this package');

    const baseAmount = dto.billing === BillingType.ONE_TIME ? pkg.priceOneTime : pkg.priceMonthly!;
    // Coupon: validate, then take one use atomically. It is given back if the payment fails.
    let amount = baseAmount, discount = 0, couponId: string | undefined;
    if (dto.couponCode?.trim()) {
      const q = await this.coupons.quote(dto.couponCode, pkg, baseAmount);
      await this.coupons.reserve(q.coupon.id);
      amount = q.final; discount = q.discount; couponId = q.coupon.id;
    }
    const payer = await this.prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    const free = amount === 0;
    const provider = free ? 'coupon' : dto.method === 'FAWRY' ? 'fawry' : dto.method === 'INSTAPAY' ? 'instapay' : 'paymob';
    let payment;
    try {
      payment = await this.prisma.payment.create({
        data: { payerId: user.id, studentId, packageId: pkg.id, amount, method: dto.method, billing: dto.billing, provider, couponId, discountAmount: discount },
      });
    } catch (e) {
      if (couponId) await this.coupons.release(couponId);
      throw e;
    }
    if (free) {
      // 100% off: no gateway needed, unlock the course straight away
      await this.markPaid(payment.id, { freeWithCoupon: true });
      return { paymentId: payment.id, method: dto.method, amount: 0, free: true as const };
    }
    const input = { paymentId: payment.id, amount, itemName: `Codiq · ${pkg.name}`, customer: payer };

    switch (dto.method) {
      case 'CARD':
      case 'WALLET':
      case 'INSTALLMENTS': {
        const r = await this.paymob.createIntention(dto.method, input);
        await this.prisma.payment.update({ where: { id: payment.id }, data: { providerRef: r.providerRef } });
        return { paymentId: payment.id, method: dto.method, amount, redirectUrl: r.redirectUrl };
      }
      case 'FAWRY': {
        const r = await this.fawry.createReference(input);
        await this.prisma.payment.update({ where: { id: payment.id }, data: { providerRef: r.providerRef } });
        return { paymentId: payment.id, method: dto.method, amount, fawryReference: r.providerRef, expiresAt: r.expiresAt };
      }
      case 'INSTAPAY':
        return { paymentId: payment.id, method: dto.method, amount, instapayAddress: this.config.get('INSTAPAY_ADDRESS') };
    }
  }

  async submitInstapay(user: AuthUser, id: string, dto: InstapayReceiptDto) {
    const p = await this.prisma.payment.findFirst({ where: { id, payerId: user.id, method: 'INSTAPAY', status: 'PENDING' } });
    if (!p) throw new NotFoundException();
    if (!dto.receiptKey.startsWith(`receipt/${user.id}/`)) throw new ForbiddenException();
    return this.prisma.payment.update({
      where: { id },
      data: { status: 'AWAITING_REVIEW', receiptKey: dto.receiptKey, providerRef: dto.senderReference },
    });
  }

  /** Idempotent: safe to call from repeated webhooks. Activates or extends the enrollment. */
  async markPaid(id: string, raw?: Prisma.InputJsonValue) {
    let activated = false;
    await this.prisma.$transaction(async (tx) => {
      const p = await tx.payment.findUnique({ where: { id } });
      if (!p || p.status === 'PAID') return;
      activated = true;
      await tx.payment.update({ where: { id }, data: { status: 'PAID', paidAt: new Date(), raw } });
      const key = { userId_packageId: { userId: p.studentId, packageId: p.packageId } };
      const existing = await tx.enrollment.findUnique({ where: key });
      const from = existing?.activeUntil && existing.activeUntil > new Date() ? existing.activeUntil : new Date();
      const activeUntil = p.billing === 'MONTHLY' ? new Date(from.getTime() + 30 * DAY) : null;
      await tx.enrollment.upsert({
        where: key,
        create: { userId: p.studentId, packageId: p.packageId, billing: p.billing, activeUntil },
        update: { billing: p.billing, status: 'ACTIVE', activeUntil },
      });
    });
    this.log.log(`Payment ${id} paid`);
    if (activated) await this.sendReceipt(id);
  }

  /** Best effort: a failed email must never undo a confirmed payment. */
  private async sendReceipt(id: string) {
    try {
      const p = await this.prisma.payment.findUnique({
        where: { id },
        include: { payer: { select: { name: true, email: true } }, student: { select: { name: true } }, package: { select: { name: true } }, },
      });
      if (!p) return;
      const enrollment = await this.prisma.enrollment.findUnique({ where: { userId_packageId: { userId: p.studentId, packageId: p.packageId } } });
      const fmt = (d: Date) => d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
      await this.mail.sendTemplate(
        p.payer.email,
        paymentReceiptMail({
          name: p.payer.name, packageName: p.package.name, studentName: p.student.name,
          amountEgp: `${(p.amount / 100).toLocaleString('en-US', { maximumFractionDigits: 2 })} EGP`,
          method: p.method, reference: p.providerRef ?? p.id, paidAt: fmt(p.paidAt ?? new Date()),
          dashboardUrl: `${this.config.get('FRONTEND_URL')}/dashboard`,
          monthlyUntil: p.billing === 'MONTHLY' && enrollment?.activeUntil ? fmt(enrollment.activeUntil) : undefined,
        }),
      );
    } catch (e) {
      this.log.error(`Receipt email failed for payment ${id}: ${(e as Error).message}`);
    }
  }

  async markFailed(id: string, raw?: Prisma.InputJsonValue) {
    const r = await this.prisma.payment.updateMany({ where: { id, status: { in: ['PENDING', 'AWAITING_REVIEW'] } }, data: { status: 'FAILED', raw } });
    if (r.count) {
      const p = await this.prisma.payment.findUnique({ where: { id }, select: { couponId: true } });
      if (p?.couponId) await this.coupons.release(p.couponId); // a failed payment gives its coupon use back
    }
  }
}

@Controller('payments')
class PaymentsController {
  constructor(
    private payments: PaymentsService,
    private prisma: PrismaService,
    private storage: StorageService,
    private paymob: PaymobProvider,
    private fawry: FawryProvider,
  ) {}

  @Roles(Role.STUDENT, Role.PARENT)
  @Post('checkout')
  checkout(@CurrentUser() u: AuthUser, @Body() dto: CheckoutDto) {
    return this.payments.checkout(u, dto);
  }

  @Get('mine')
  mine(@CurrentUser() u: AuthUser) {
    return this.prisma.payment.findMany({
      where: { payerId: u.id },
      orderBy: { createdAt: 'desc' },
      include: { package: { select: { name: true } }, student: { select: { name: true } } },
    });
  }

  @Get(':id')
  async one(@CurrentUser() u: AuthUser, @Param('id') id: string) {
    const p = await this.prisma.payment.findUnique({ where: { id }, include: { package: { select: { name: true } } } });
    if (!p || (p.payerId !== u.id && u.role !== Role.ADMIN)) throw new NotFoundException();
    const { raw, ...rest } = p;
    return rest;
  }

  @Roles(Role.STUDENT, Role.PARENT)
  @Post(':id/instapay-receipt') @HttpCode(200)
  instapay(@CurrentUser() u: AuthUser, @Param('id') id: string, @Body() dto: InstapayReceiptDto) {
    return this.payments.submitInstapay(u, id, dto);
  }

  // ---- Admin ----
  @Roles(Role.ADMIN)
  @Get()
  list(@Query('status') status?: PaymentStatus) {
    return this.prisma.payment.findMany({
      where: status ? { status } : {},
      orderBy: { createdAt: 'desc' },
      take: 200,
      include: { package: { select: { name: true } }, payer: { select: { name: true, email: true } }, student: { select: { name: true } }, coupon: { select: { code: true } } },
    });
  }

  @Roles(Role.ADMIN)
  @Get(':id/receipt')
  async receipt(@Param('id') id: string) {
    const p = await this.prisma.payment.findUnique({ where: { id } });
    if (!p?.receiptKey) throw new NotFoundException();
    return { url: await this.storage.downloadUrl(p.receiptKey) };
  }

  @Roles(Role.ADMIN)
  @Patch(':id/approve')
  async approve(@Param('id') id: string) {
    await this.assertAwaitingReview(id);
    await this.payments.markPaid(id, { approvedManually: true });
    return { ok: true };
  }

  @Roles(Role.ADMIN)
  @Patch(':id/reject')
  async reject(@Param('id') id: string) {
    await this.assertAwaitingReview(id);
    await this.payments.markFailed(id, { rejectedManually: true });
    return { ok: true };
  }

  /** Manual decisions only apply to InstaPay receipts that a student has submitted. */
  private async assertAwaitingReview(id: string) {
    const p = await this.prisma.payment.findUnique({ where: { id }, select: { status: true } });
    if (!p) throw new NotFoundException();
    if (p.status !== 'AWAITING_REVIEW') throw new BadRequestException('Only receipts awaiting review can be approved or rejected');
  }

  // ---- Webhooks (called by providers, not browsers) ----
  @Public()
  @Post('webhooks/paymob') @HttpCode(200)
  async paymobHook(@Query('hmac') hmac: string, @Body() body: any) {
    if (body?.type !== 'TRANSACTION') return { ok: true };
    const obj = body.obj;
    if (!this.paymob.verify(obj, hmac)) throw new UnauthorizedException('Bad signature');
    const paymentId = obj.order?.merchant_order_id ?? obj.special_reference;
    if (!paymentId) return { ok: true };
    if (obj.success && !obj.pending) await this.payments.markPaid(paymentId, { paymobTransactionId: obj.id });
    else if (!obj.pending) await this.payments.markFailed(paymentId, { paymobTransactionId: obj.id });
    return { ok: true };
  }

  @Public()
  @Post('webhooks/fawry') @HttpCode(200)
  async fawryHook(@Body() body: any) {
    if (!this.fawry.verify(body)) throw new UnauthorizedException('Bad signature');
    if (body.orderStatus === 'PAID') await this.payments.markPaid(body.merchantRefNumber, { fawryRef: body.fawryRefNumber });
    else if (['EXPIRED', 'CANCELED', 'FAILED'].includes(body.orderStatus)) await this.payments.markFailed(body.merchantRefNumber, body);
    return { ok: true };
  }
}

@Module({ imports: [CouponsModule], controllers: [PaymentsController], providers: [PaymentsService, PaymobProvider, FawryProvider] })
export class PaymentsModule {}
