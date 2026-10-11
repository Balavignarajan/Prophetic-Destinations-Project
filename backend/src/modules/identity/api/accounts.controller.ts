import {
  Body,
  Controller,
  Get,
  Header,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { AccountService } from '../application/account.service.js';
import type { AuthenticatedAdmin } from '../domain/admin-account.js';
import { Role } from '../domain/role.js';
import { CurrentAdmin } from '../guards/current-admin.decorator.js';
import { Roles } from '../guards/roles.decorator.js';
import {
  AccountEventDto,
  AccountEventListResponseDto,
  AccountListResponseDto,
  AccountResponseDto,
  ChangeRoleDto,
  CreateAccountDto,
  ListAccountsQueryDto,
  PasswordResetDto,
} from './dto/account.dto.js';

const DEFAULT_LIMIT = 50;

/**
 * Admin account management. ADMIN only, on every route: the role is enforced here on the backend, and the
 * service re-checks it inside each write transaction. Responses never contain a password, a hash or a token
 * (each response is sent `no-store`).
 */
@Roles(Role.ADMIN)
@Controller('admin/accounts')
export class AccountsController {
  constructor(private readonly accounts: AccountService) {}

  @Header('Cache-Control', 'no-store')
  @Post()
  async create(
    @CurrentAdmin() actor: AuthenticatedAdmin,
    @Body() dto: CreateAccountDto,
  ): Promise<AccountResponseDto> {
    return AccountResponseDto.from(await this.accounts.create(actor, dto));
  }

  @Header('Cache-Control', 'no-store')
  @Get()
  async list(
    @Query() query: ListAccountsQueryDto,
  ): Promise<AccountListResponseDto> {
    const limit = query.limit ?? DEFAULT_LIMIT;
    const offset = query.offset ?? 0;
    const { items, total } = await this.accounts.list(limit, offset);
    return {
      items: items.map((account) => AccountResponseDto.from(account)),
      total,
      limit,
      offset,
    };
  }

  @Header('Cache-Control', 'no-store')
  @Get(':accountId')
  async get(
    @Param('accountId', ParseUUIDPipe) accountId: string,
  ): Promise<AccountResponseDto> {
    return AccountResponseDto.from(await this.accounts.get(accountId));
  }

  @Header('Cache-Control', 'no-store')
  @Get(':accountId/events')
  async events(
    @Param('accountId', ParseUUIDPipe) accountId: string,
    @Query() query: ListAccountsQueryDto,
  ): Promise<AccountEventListResponseDto> {
    const limit = query.limit ?? DEFAULT_LIMIT;
    const offset = query.offset ?? 0;
    const { items, total } = await this.accounts.listEvents(
      accountId,
      limit,
      offset,
    );
    return {
      items: items.map((event) => AccountEventDto.from(event)),
      total,
      limit,
      offset,
    };
  }

  @Header('Cache-Control', 'no-store')
  @Put(':accountId/role')
  async changeRole(
    @CurrentAdmin() actor: AuthenticatedAdmin,
    @Param('accountId', ParseUUIDPipe) accountId: string,
    @Body() dto: ChangeRoleDto,
  ): Promise<AccountResponseDto> {
    return AccountResponseDto.from(
      await this.accounts.changeRole(actor, accountId, dto.role),
    );
  }

  @Header('Cache-Control', 'no-store')
  @Post(':accountId/disable')
  @HttpCode(200)
  async disable(
    @CurrentAdmin() actor: AuthenticatedAdmin,
    @Param('accountId', ParseUUIDPipe) accountId: string,
  ): Promise<AccountResponseDto> {
    return AccountResponseDto.from(
      await this.accounts.disable(actor, accountId),
    );
  }

  @Header('Cache-Control', 'no-store')
  @Post(':accountId/enable')
  @HttpCode(200)
  async enable(
    @CurrentAdmin() actor: AuthenticatedAdmin,
    @Param('accountId', ParseUUIDPipe) accountId: string,
  ): Promise<AccountResponseDto> {
    return AccountResponseDto.from(
      await this.accounts.enable(actor, accountId),
    );
  }

  @Header('Cache-Control', 'no-store')
  @Post(':accountId/password-reset')
  @HttpCode(200)
  async passwordReset(
    @CurrentAdmin() actor: AuthenticatedAdmin,
    @Param('accountId', ParseUUIDPipe) accountId: string,
    @Body() dto: PasswordResetDto,
  ): Promise<AccountResponseDto> {
    return AccountResponseDto.from(
      await this.accounts.requirePasswordReset(
        actor,
        accountId,
        dto.temporaryPassword,
      ),
    );
  }
}
