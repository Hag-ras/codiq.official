import {
  BadRequestException, Body, Controller, ForbiddenException, Get, HttpCode, Injectable, Logger, Module, NotFoundException, OnModuleDestroy, OnModuleInit, Param, Patch, Post, Query, UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { IsEnum, IsOptional, IsString } from 'class-validator';
import { BillingType, PaymentMethod, PaymentStatus, Prisma, Role, WebhookStatus } from '@prisma/client';
import { MailService, PrismaService, StorageService } from '../common/infra.module';
import { asLang, paymentReceiptMail } from '../common/mail-templates';
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
    // Fawry is optional: without a merchant code the option does not exist
    if (dto.method === PaymentMethod.FAWRY && !this.config.get('FAWRY_MERCHANT_CODE')) throw new BadRequestException('Fawry is not available. Please choose another payment method.');
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
        include: { payer: { select: { name: true, email: true, language: true } }, student: { select: { name: true } }, package: { select: { name: true } }, },
      });
      if (!p) return;
      const enrollment = await this.prisma.enrollment.findUnique({ where: { userId_packageId: { userId: p.studentId, packageId: p.packageId } } });
      const fmt = (d: Date) => d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
      await this.mail.sendTemplate(
        p.payer.email,
        paymentReceiptMail({
          lang: asLang(p.payer.language), name: p.payer.name, packageName: p.package.name, studentName: p.student.name,
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

const MAX_ATTEMPTS = 8;
const backoffMs = (attempt: number) => Math.min(60 * 60_000, 30_000 * 2 ** (attempt - 1)); // 30 s, 1 min, 2 min ... up to 1 h

/**
 * Payment webhooks are saved first and answered with 200 at once, so a slow or failing database never makes the provider
 * give up on us. A worker then applies them (right away, and again from a timer) and retries failures with a growing delay.
 * Several API servers can run this together: an event is claimed with one atomic update.
 */
@Injectable()
export class WebhookQueue implements OnModuleInit, OnModuleDestroy {
  private log = new Logger('Webhooks');
  private timer?: NodeJS.Timeout;
  constructor(private prisma: PrismaService, private payments: PaymentsService, private config: ConfigService) {}

  onModuleInit() {
    if (this.config.get('JOBS_ENABLED', 'true') === 'false') return;
    this.timer = setInterval(() => void this.sweep(), 30_000);
    this.timer.unref();
  }
  onModuleDestroy() { if (this.timer) clearInterval(this.timer); }

  /** Stores the delivery. A repeated delivery of the same event is stored once. */
  async accept(provider: 'paymob' | 'fawry', dedupeKey: string, payload: Prisma.InputJsonValue) {
    try {
      const ev = await this.prisma.webhookEvent.create({ data: { provider, dedupeKey, payload } });
      setImmediate(() => void this.process(ev.id));
      return ev.id;
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') return null; // already have it
      throw e;
    }
  }

  async process(id: string) {
    const now = new Date();
    const claimed = await this.prisma.webhookEvent.updateMany({
      where: { id, status: WebhookStatus.PENDING, nextAttemptAt: { lte: now } },
      data: { status: WebhookStatus.PROCESSING, nextAttemptAt: now, attempts: { increment: 1 } },
    });
    if (!claimed.count) return; // someone else has it, or it is not due yet
    const ev = await this.prisma.webhookEvent.findUniqueOrThrow({ where: { id } });
    try {
      await this.apply(ev.provider, ev.payload as any);
      await this.prisma.webhookEvent.update({ where: { id }, data: { status: WebhookStatus.DONE, processedAt: new Date(), lastError: null } });
    } catch (e) {
      const msg = (e as Error).message.slice(0, 500);
      const giveUp = ev.attempts >= MAX_ATTEMPTS;
      this.log[giveUp ? 'error' : 'warn'](`Webhook ${id} (${ev.provider}) attempt ${ev.attempts} failed: ${msg}${giveUp ? ' - giving up, an admin must retry it' : ''}`);
      await this.prisma.webhookEvent.update({
        where: { id },
        data: giveUp ? { status: WebhookStatus.FAILED, lastError: msg } : { status: WebhookStatus.PENDING, lastError: msg, nextAttemptAt: new Date(Date.now() + backoffMs(ev.attempts)) },
      });
    }
  }

  /** Picks up events that are due again, and ones stuck "processing" because a server died mid-way. */
  async sweep() {
    try {
      await this.prisma.webhookEvent.updateMany({ where: { status: WebhookStatus.PROCESSING, nextAttemptAt: { lt: new Date(Date.now() - 5 * 60_000) } }, data: { status: WebhookStatus.PENDING } });
      const due = await this.prisma.webhookEvent.findMany({ where: { status: WebhookStatus.PENDING, nextAttemptAt: { lte: new Date() } }, orderBy: { receivedAt: 'asc' }, take: 20, select: { id: true } });
      for (const { id } of due) await this.process(id);
      await this.prisma.webhookEvent.deleteMany({ where: { status: WebhookStatus.DONE, processedAt: { lt: new Date(Date.now() - 90 * DAY) } } });
    } catch (e) {
      this.log.error(`Webhook sweep failed: ${(e as Error).message}`);
    }
  }

  async retry(id: string) {
    const r = await this.prisma.webhookEvent.updateMany({ where: { id, status: WebhookStatus.FAILED }, data: { status: WebhookStatus.PENDING, nextAttemptAt: new Date(), attempts: 0 } });
    if (!r.count) throw new NotFoundException('Only failed events can be retried');
    await this.process(id);
  }

  private async apply(provider: string, body: any) {
    if (provider === 'paymob') {
      const obj = body.obj;
      const paymentId = obj?.order?.merchant_order_id ?? obj?.special_reference;
      if (!paymentId) return;
      if (obj.success && !obj.pending) await this.payments.markPaid(paymentId, { paymobTransactionId: obj.id });
      else if (!obj.pending) await this.payments.markFailed(paymentId, { paymobTransactionId: obj.id });
    } else if (provider === 'fawry') {
      if (body.orderStatus === 'PAID') await this.payments.markPaid(body.merchantRefNumber, { fawryRef: body.fawryRefNumber });
      else if (['EXPIRED', 'CANCELED', 'FAILED'].includes(body.orderStatus)) await this.payments.markFailed(body.merchantRefNumber, body);
    }
  }
}

/** Admin tools for the webhook queue. Registered before PaymentsController so "webhook-events" is not read as a payment id. */
@Controller('payments/webhook-events')
class WebhookAdminController {
  constructor(private prisma: PrismaService, private queue: WebhookQueue) {}

  @Roles(Role.ADMIN)
  @Get()
  list(@Query('status') status?: WebhookStatus) {
    return this.prisma.webhookEvent.findMany({ where: status ? { status } : { status: { not: 'DONE' } }, orderBy: { receivedAt: 'desc' }, take: 100 });
  }

  @Roles(Role.ADMIN)
  @Post(':id/retry') @HttpCode(200)
  async retry(@Param('id') id: string) { await this.queue.retry(id); return { ok: true }; }
}

@Controller('payments')
class PaymentsController {
  constructor(
    private payments: PaymentsService,
    private prisma: PrismaService,
    private storage: StorageService,
    private paymob: PaymobProvider,
    private fawry: FawryProvider,
    private queue: WebhookQueue,
    private config: ConfigService,
  ) {}

  @Roles(Role.STUDENT, Role.PARENT)
  @Post('checkout')
  checkout(@CurrentUser() u: AuthUser, @Body() dto: CheckoutDto) {
    return this.payments.checkout(u, dto);
  }

  @Roles(Role.STUDENT, Role.PARENT)
  @Get('mine')
  mine(@CurrentUser() u: AuthUser) {
    return this.prisma.payment.findMany({
      where: { payerId: u.id },
      orderBy: { createdAt: 'desc' },
      include: { package: { select: { name: true } }, student: { select: { name: true } } },
    });
  }

  /** Which payment methods are switched on (their keys are set). The checkout shows only these. */
  @Roles(Role.STUDENT, Role.PARENT)
  @Get('methods')
  methods() {
    const has = (...keys: string[]) => keys.every((k) => !!this.config.get<string>(k)?.trim());
    const paymob = has('PAYMOB_SECRET_KEY', 'PAYMOB_PUBLIC_KEY', 'PAYMOB_HMAC_SECRET');
    return {
      CARD: paymob && has('PAYMOB_CARD_INTEGRATION_ID'),
      WALLET: paymob && has('PAYMOB_WALLET_INTEGRATION_ID'),
      INSTALLMENTS: paymob && has('PAYMOB_INSTALLMENT_INTEGRATION_IDS'),
      FAWRY: has('FAWRY_MERCHANT_CODE', 'FAWRY_SECURE_KEY'),
      INSTAPAY: has('INSTAPAY_ADDRESS'),
    };
  }

  @Roles(Role.STUDENT, Role.PARENT, Role.ADMIN)
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
    // Save and answer at once; the queue applies it (and retries if the database hiccups)
    await this.queue.accept('paymob', `paymob:${obj.id}:${obj.success}:${obj.pending}`, { type: 'TRANSACTION', obj });
    return { ok: true };
  }

  @Public()
  @Post('webhooks/fawry') @HttpCode(200)
  async fawryHook(@Body() body: any) {
    if (!this.fawry.verify(body)) throw new UnauthorizedException('Bad signature');
    await this.queue.accept('fawry', `fawry:${body.fawryRefNumber}:${body.orderStatus}`, body);
    return { ok: true };
  }
}

@Module({ imports: [CouponsModule], controllers: [WebhookAdminController, PaymentsController], providers: [PaymentsService, PaymobProvider, FawryProvider, WebhookQueue] })
export class PaymentsModule {}
