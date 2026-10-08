import { Injectable } from '@nestjs/common';
import * as argon2 from 'argon2';

/** Argon2id password hashing. Plaintext passwords never leave this class. */
@Injectable()
export class PasswordHasher {
  private dummyHash?: Promise<string>;

  hash(plain: string): Promise<string> {
    return argon2.hash(plain, { type: argon2.argon2id });
  }

  /** True only for a matching password. A malformed stored hash counts as a mismatch. */
  async verify(hash: string, plain: string): Promise<boolean> {
    try {
      return await argon2.verify(hash, plain);
    } catch {
      return false;
    }
  }

  /**
   * Spends the same time as a real verification. Used when the email is unknown
   * so response time does not reveal whether an account exists.
   */
  async verifyAgainstDummy(plain: string): Promise<void> {
    this.dummyHash ??= this.hash('not-a-real-password');
    await this.verify(await this.dummyHash, plain);
  }
}
