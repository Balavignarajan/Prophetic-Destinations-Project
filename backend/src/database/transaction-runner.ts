import { Injectable } from '@nestjs/common';
import { DataSource, type EntityManager } from 'typeorm';
import { ConflictError } from '../shared-kernel/index.js';
import { isConcurrencyFailure, isLockTimeout } from './pg-errors.js';

export interface TransactionOptions {
  /**
   * Give up waiting for any lock after this many milliseconds (PostgreSQL `lock_timeout`).
   * Applied with `set_config(..., is_local => true)`, i.e. `SET LOCAL`: it lasts only until this
   * transaction commits or rolls back, so it can never leak to the next user of a pooled connection.
   */
  lockTimeoutMs?: number;
  /**
   * Whether a lock timeout, deadlock or serialization failure is translated into a retryable
   * ConflictError (default: true). Turn it off for a use case where "retry the same request" is not
   * a safe or accurate answer; the original error then propagates unchanged, exactly as it did
   * before the translation existed.
   */
  translateConcurrencyErrors?: boolean;
}

/**
 * Runs a use case inside one database transaction.
 * The EntityManager is passed explicitly to repositories, so it is always
 * visible which writes share a transaction. Reads usually run outside one.
 *
 * Failures caused only by concurrency (a lock wait that timed out, a deadlock, a
 * serialization failure) are translated into a controlled, retryable ConflictError:
 * the transaction has been rolled back, nothing changed, and no database detail is exposed.
 */
@Injectable()
export class TransactionRunner {
  constructor(private readonly dataSource: DataSource) {}

  async run<T>(
    work: (manager: EntityManager) => Promise<T>,
    options: TransactionOptions = {},
  ): Promise<T> {
    try {
      return await this.dataSource.transaction(async (manager) => {
        if (options.lockTimeoutMs !== undefined) {
          await manager.query(`SELECT set_config('lock_timeout', $1, true)`, [
            `${Math.trunc(options.lockTimeoutMs)}ms`,
          ]);
        }
        return work(manager);
      });
    } catch (error) {
      throw options.translateConcurrencyErrors === false
        ? error
        : translateConcurrencyError(error);
    }
  }
}

/** Maps lock timeouts, deadlocks and serialization failures to a retryable ConflictError; anything else is returned as is. */
export function translateConcurrencyError(error: unknown): unknown {
  if (isLockTimeout(error)) {
    return new ConflictError(
      'This is being changed by someone else right now. Try again in a moment.',
      { reason: 'LOCK_TIMEOUT', retryable: true },
    );
  }
  if (isConcurrencyFailure(error)) {
    return new ConflictError(
      'The request collided with another change. Try again.',
      { reason: 'CONCURRENT_UPDATE', retryable: true },
    );
  }
  return error;
}
