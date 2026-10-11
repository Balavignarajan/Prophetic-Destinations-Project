import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import { ThrottlerModule } from '@nestjs/throttler';
import { TypeOrmModule } from '@nestjs/typeorm';
import { APP_CONFIG, type AppConfig } from '../../config/index.js';
import { AccountsController } from './api/accounts.controller.js';
import { AuthController } from './api/auth.controller.js';
import { AccountService } from './application/account.service.js';
import { AccessTokenService } from './application/access-token.service.js';
import { AdminProvisioningService } from './application/admin-provisioning.service.js';
import { AuthService } from './application/auth.service.js';
import { PasswordHasher } from './application/password-hasher.js';
import { SessionService } from './application/session.service.js';
import { JwtAuthGuard } from './guards/jwt-auth.guard.js';
import { RolesGuard } from './guards/roles.guard.js';
import { AccountEventRepository } from './persistence/account-event.repository.js';
import { AdminEntity } from './persistence/admin.entity.js';
import { AdminRepository } from './persistence/admin.repository.js';
import { AdminRefreshTokenEntity } from './persistence/refresh-token.entity.js';
import { RefreshTokenRepository } from './persistence/refresh-token.repository.js';

@Module({
  imports: [
    TypeOrmModule.forFeature([AdminEntity, AdminRefreshTokenEntity]),
    JwtModule.registerAsync({
      inject: [APP_CONFIG],
      useFactory: (config: AppConfig) => ({ secret: config.jwtAccessSecret }),
    }),
    // The default throttler is applied explicitly (ThrottlerGuard) to login and refresh only.
    ThrottlerModule.forRootAsync({
      inject: [APP_CONFIG],
      useFactory: (config: AppConfig) => ({
        throttlers: [
          {
            ttl: config.authRateWindowSeconds * 1000,
            limit: config.authRateLimit,
          },
        ],
      }),
    }),
  ],
  controllers: [AuthController, AccountsController],
  providers: [
    AdminRepository,
    RefreshTokenRepository,
    PasswordHasher,
    AccessTokenService,
    SessionService,
    AuthService,
    AdminProvisioningService,
    AccountService,
    AccountEventRepository,
    // Global, default-deny. Order matters: authenticate first, then check roles.
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
})
export class IdentityModule {}
