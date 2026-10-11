import { Type } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import type {
  AccountEvent,
  ManagedAccount,
} from '../../domain/account-management.js';
import { PASSWORD_MAX_LENGTH } from '../../domain/password-policy.js';
import { ROLES, type Role } from '../../domain/role.js';

export class CreateAccountDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(320)
  email: string;

  @IsIn(ROLES)
  role: Role;

  /** The password policy is checked by the service, which reports every problem at once. */
  @IsString()
  @IsNotEmpty()
  @MaxLength(PASSWORD_MAX_LENGTH + 64)
  temporaryPassword: string;
}

export class ChangeRoleDto {
  @IsIn(ROLES)
  role: Role;
}

export class PasswordResetDto {
  /**
   * Mandatory: the account's password is replaced by this temporary one, so a reset always cuts off whoever knew the
   * old password. The password policy is checked by the service, which reports every problem at once.
   */
  @IsString()
  @IsNotEmpty()
  @MaxLength(PASSWORD_MAX_LENGTH + 64)
  temporaryPassword: string;
}

export class ListAccountsQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  limit?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  offset?: number;
}

/** The only account fields the API returns: no password hash, no tokens. */
export class AccountResponseDto {
  id: string;
  email: string;
  role: Role;
  status: 'ACTIVE' | 'DISABLED';
  mustChangePassword: boolean;
  createdAt: string;
  updatedAt: string;
  version: number;

  static from(account: ManagedAccount): AccountResponseDto {
    return {
      id: account.id,
      email: account.email,
      role: account.role,
      status: account.status,
      mustChangePassword: account.mustChangePassword,
      createdAt: account.createdAt.toISOString(),
      updatedAt: account.updatedAt.toISOString(),
      version: account.version,
    };
  }
}

export class AccountListResponseDto {
  items: AccountResponseDto[];
  total: number;
  limit: number;
  offset: number;
}

export class AccountEventDto {
  id: string;
  seq: number;
  subjectAdminId: string;
  actorAdminId: string;
  action: AccountEvent['action'];
  fromValue: string | null;
  toValue: string | null;
  createdAt: string;

  static from(event: AccountEvent): AccountEventDto {
    return { ...event, createdAt: event.createdAt.toISOString() };
  }
}

export class AccountEventListResponseDto {
  items: AccountEventDto[];
  total: number;
  limit: number;
  offset: number;
}
