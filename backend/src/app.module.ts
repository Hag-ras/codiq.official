import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { InfraModule } from './common/infra.module';
import { JwtAuthGuard, RolesGuard } from './common/guards';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { PackagesModule } from './packages/packages.module';
import { SessionsModule } from './sessions/sessions.module';
import { LearningModule } from './learning/learning.module';
import { PaymentsModule } from './payments/payments.module';
import { LiveModule } from './live/live.module';
import { ParentsModule } from './parents/parents.module';
import { SupportModule } from './support/support.module';
import { AdminModule } from './admin/admin.module';
import { AccountModule } from './account/account.module';
import { CouponsModule } from './coupons/coupons.module';
import { ProgressModule } from './progress/progress.module';
import { NotificationsModule } from './notifications/notifications.module';
import { CertificatesModule } from './certificates/certificates.module';
import { ScheduleModule } from './schedule/schedule.module';
import { AdminAreaGuard } from './common/admin-area.guard';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 120 }]),
    InfraModule,
    AuthModule,
    UsersModule,
    PackagesModule,
    SessionsModule,
    LearningModule,
    PaymentsModule,
    LiveModule,
    ParentsModule,
    SupportModule,
    AdminModule,
    AccountModule,
    CouponsModule,
    ProgressModule,
    NotificationsModule,
    CertificatesModule,
    ScheduleModule,
  ],
  providers: [
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    // Must come right after JwtAuthGuard: locks every /admin path to admins, whatever the route decorators say
    { provide: APP_GUARD, useClass: AdminAreaGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
})
export class AppModule {}
