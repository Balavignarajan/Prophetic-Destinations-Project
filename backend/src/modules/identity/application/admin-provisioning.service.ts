import { Injectable } from '@nestjs/common';
import {
  BusinessRuleError,
  ConflictError,
} from '../../../shared-kernel/index.js';
import {
  type AuthenticatedAdmin,
  toAuthenticatedAdmin,
} from '../domain/admin-account.js';
import { isValidEmail, normalizeEmail } from '../domain/email.js';
import { checkPasswordPolicy } from '../domain/password-policy.js';
import { type Role, isRole } from '../domain/role.js';
import { AdminRepository } from '../persistence/admin.repository.js';
import { PasswordHasher } from './password-hasher.js';

export interface NewAdminInput {
  email: string;
  password: string;
  role: Role;
}

/**
 * Creates admin accounts. There is deliberately no HTTP endpoint for this yet:
 * today it is used by the seed command only, and later by the invite flow.
 */
@Injectable()
export class AdminProvisioningService {
  constructor(
    private readonly admins: AdminRepository,
    private readonly passwords: PasswordHasher,
  ) {}

  async create(input: NewAdminInput): Promise<AuthenticatedAdmin> {
    const email = normalizeEmail(input.email);
    const problems = [
      ...(isValidEmail(email) ? [] : ['Email is not valid']),
      ...(isRole(input.role) ? [] : ['Role is not valid']),
      ...checkPasswordPolicy(input.password),
    ];
    if (problems.length > 0) {
      throw new BusinessRuleError('Admin account is not valid', problems);
    }

    const account = await this.admins.create({
      email,
      role: input.role,
      passwordHash: await this.passwords.hash(input.password),
    });
    return toAuthenticatedAdmin(account);
  }

  /** Idempotent create: never changes an existing account (including its password). */
  async ensure(input: NewAdminInput): Promise<{ created: boolean }> {
    if (await this.admins.findByEmail(normalizeEmail(input.email))) {
      return { created: false };
    }
    try {
      await this.create(input);
      return { created: true };
    } catch (error) {
      if (error instanceof ConflictError) return { created: false };
      throw error;
    }
  }
}
