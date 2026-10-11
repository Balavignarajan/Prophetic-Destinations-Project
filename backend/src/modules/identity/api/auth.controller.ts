import {
  Body,
  Controller,
  Get,
  Header,
  HttpCode,
  Inject,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import { APP_CONFIG, type AppConfig } from '../../../config/index.js';
import { Public } from '../../../platform/public.decorator.js';
import { UnauthorizedError } from '../../../shared-kernel/index.js';
import { AuthService } from '../application/auth.service.js';
import type { AuthenticatedAdmin } from '../domain/admin-account.js';
import { AccountService } from '../application/account.service.js';
import { AllowPasswordChangePending } from '../guards/allow-password-change-pending.decorator.js';
import { CurrentAdmin } from '../guards/current-admin.decorator.js';
import {
  AdminSummaryDto,
  AuthSessionResponseDto,
} from './dto/auth-responses.dto.js';
import { ChangePasswordDto } from './dto/change-password.dto.js';
import { LoginDto } from './dto/login.dto.js';
import {
  clearRefreshCookie,
  readRefreshCookie,
  setRefreshCookie,
} from './refresh-cookie.js';

/** Thin HTTP layer: parse the request, call AuthService, shape the response. */
@Controller('admin/auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly accounts: AccountService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  @Public()
  @UseGuards(ThrottlerGuard)
  @Post('login')
  @HttpCode(200)
  @Header('Cache-Control', 'no-store')
  async login(
    @Body() dto: LoginDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<AuthSessionResponseDto> {
    const session = await this.auth.login(dto.email, dto.password);
    setRefreshCookie(
      res,
      session.refreshToken,
      session.refreshTokenExpiresAt,
      this.config.secureCookies,
    );
    return AuthSessionResponseDto.from(session);
  }

  @Public()
  @UseGuards(ThrottlerGuard)
  @Post('refresh')
  @HttpCode(200)
  @Header('Cache-Control', 'no-store')
  async refresh(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<AuthSessionResponseDto> {
    try {
      const session = await this.auth.refresh(readRefreshCookie(req));
      setRefreshCookie(
        res,
        session.refreshToken,
        session.refreshTokenExpiresAt,
        this.config.secureCookies,
      );
      return AuthSessionResponseDto.from(session);
    } catch (error) {
      if (error instanceof UnauthorizedError) {
        clearRefreshCookie(res, this.config.secureCookies);
      }
      throw error;
    }
  }

  /** Public because it works from the refresh cookie alone, so an expired access token can still log out. */
  @Public()
  @Post('logout')
  @HttpCode(204)
  @Header('Cache-Control', 'no-store')
  async logout(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<void> {
    await this.auth.logout(readRefreshCookie(req));
    clearRefreshCookie(res, this.config.secureCookies);
  }

  /**
   * Changes the signed-in admin's own password. All their sessions end (including other devices' refresh tokens);
   * the caller receives a fresh session in the response and cookie. Rate limited like login, because it checks the
   * current password.
   */
  @AllowPasswordChangePending()
  @UseGuards(ThrottlerGuard)
  @Post('password')
  @HttpCode(200)
  @Header('Cache-Control', 'no-store')
  async changePassword(
    @CurrentAdmin() admin: AuthenticatedAdmin,
    @Body() dto: ChangePasswordDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<AuthSessionResponseDto> {
    const changed = await this.accounts.changeOwnPassword(
      admin.id,
      dto.currentPassword,
      dto.newPassword,
    );
    const session = await this.auth.startSessionFor(changed);
    setRefreshCookie(
      res,
      session.refreshToken,
      session.refreshTokenExpiresAt,
      this.config.secureCookies,
    );
    return AuthSessionResponseDto.from(session);
  }

  @AllowPasswordChangePending()
  @Get('me')
  @Header('Cache-Control', 'no-store')
  me(@CurrentAdmin() admin: AuthenticatedAdmin): AdminSummaryDto {
    return AdminSummaryDto.from(admin);
  }
}
