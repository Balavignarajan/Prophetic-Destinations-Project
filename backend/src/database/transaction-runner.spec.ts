import type { DataSource, EntityManager } from 'typeorm';
import { ConflictError } from '../shared-kernel/index.js';
import {
  TransactionRunner,
  translateConcurrencyError,
} from './transaction-runner.js';

const driverError = (code: string) =>
  Object.assign(new Error('internal postgres detail: relation "lessons"'), {
    driverError: { code },
  });

/** A data source whose transactions hand the work a manager that records its queries. */
function fakeDataSource() {
  const queries: [string, unknown[] | undefined][] = [];
  const manager = {
    query: async (sql: string, params?: unknown[]) => {
      queries.push([sql, params]);
      return [];
    },
  } as unknown as EntityManager;
  const dataSource = {
    transaction: (work: (m: EntityManager) => Promise<unknown>) =>
      work(manager),
  } as unknown as DataSource;
  return { dataSource, manager, queries };
}

describe('TransactionRunner', () => {
  it('passes the transaction manager to the work and returns its result', async () => {
    const { dataSource, manager } = fakeDataSource();

    const result = await new TransactionRunner(dataSource).run(async (m) => {
      expect(m).toBe(manager);
      return 'done';
    });

    expect(result).toBe('done');
  });

  it('propagates failures so the transaction rolls back', async () => {
    const { dataSource } = fakeDataSource();

    await expect(
      new TransactionRunner(dataSource).run(async () => {
        throw new Error('boom');
      }),
    ).rejects.toThrow('boom');
  });

  describe('lock timeout', () => {
    it('sets it for this transaction only (SET LOCAL semantics) before any work runs', async () => {
      const { dataSource, queries } = fakeDataSource();
      const order: string[] = [];

      await new TransactionRunner(dataSource).run(
        async (manager) => {
          order.push(`work after ${queries.length} setup queries`);
          await manager.query('SELECT 1');
        },
        { lockTimeoutMs: 10_000 },
      );

      expect(queries[0]).toEqual([
        `SELECT set_config('lock_timeout', $1, true)`, // third argument true: local to the transaction
        ['10000ms'],
      ]);
      expect(order).toEqual(['work after 1 setup queries']);
    });

    it('sets nothing when no timeout is asked for', async () => {
      const { dataSource, queries } = fakeDataSource();
      await new TransactionRunner(dataSource).run(async () => 'ok');
      expect(queries).toEqual([]);
    });

    it('turns whole numbers of milliseconds into a valid setting', async () => {
      const { dataSource, queries } = fakeDataSource();
      await new TransactionRunner(dataSource).run(async () => 'ok', {
        lockTimeoutMs: 250.9,
      });
      expect(queries[0][1]).toEqual(['250ms']);
    });
  });

  describe('concurrency failures', () => {
    it.each([
      ['55P03', 'LOCK_TIMEOUT'],
      ['40P01', 'CONCURRENT_UPDATE'],
      ['40001', 'CONCURRENT_UPDATE'],
    ])(
      'translates %s into a retryable ConflictError (%s) without database detail',
      async (code, reason) => {
        const { dataSource } = fakeDataSource();
        const error = await new TransactionRunner(dataSource)
          .run(async () => {
            throw driverError(code);
          })
          .catch((e: unknown) => e);

        expect(error).toBeInstanceOf(ConflictError);
        expect((error as ConflictError).details).toEqual({
          reason,
          retryable: true,
        });
        expect((error as ConflictError).message).not.toMatch(
          /postgres|relation|lessons|lock timeout|deadlock/i,
        );
      },
    );

    it('translates a lock timeout raised while setting up the transaction too', async () => {
      const dataSource = {
        transaction: async () => {
          throw driverError('55P03');
        },
      } as unknown as DataSource;
      await expect(
        new TransactionRunner(dataSource).run(async () => 'ok'),
      ).rejects.toBeInstanceOf(ConflictError);
    });

    it.each(['55P03', '40P01', '40001'])(
      'with translateConcurrencyErrors: false, %s propagates as the original error, untouched',
      async (code) => {
        const { dataSource } = fakeDataSource();
        const original = driverError(code);

        const thrown = await new TransactionRunner(dataSource)
          .run(
            async () => {
              throw original;
            },
            { translateConcurrencyErrors: false },
          )
          .catch((e: unknown) => e);

        expect(thrown).toBe(original); // the very same error object, not a ConflictError
        expect(thrown).not.toBeInstanceOf(ConflictError);
      },
    );

    it('the opt-out is per call: the default (and an explicit true) still translate', async () => {
      const { dataSource } = fakeDataSource();
      const runner = new TransactionRunner(dataSource);
      const fail = () =>
        runner.run(async () => {
          throw driverError('40P01');
        });
      await expect(fail()).rejects.toBeInstanceOf(ConflictError);
      await expect(
        runner.run(
          async () => {
            throw driverError('40P01');
          },
          { translateConcurrencyErrors: true },
        ),
      ).rejects.toBeInstanceOf(ConflictError);
      // an unrelated call that opted out earlier does not change that
      await runner
        .run(
          async () => {
            throw driverError('40P01');
          },
          { translateConcurrencyErrors: false },
        )
        .catch(() => undefined);
      await expect(fail()).rejects.toBeInstanceOf(ConflictError);
    });

    it('the opt-out does not affect the lock timeout setting', async () => {
      const { dataSource, queries } = fakeDataSource();
      await new TransactionRunner(dataSource).run(async () => 'ok', {
        lockTimeoutMs: 500,
        translateConcurrencyErrors: false,
      });
      expect(queries[0][1]).toEqual(['500ms']);
    });

    it('leaves every other error exactly as it was', async () => {
      const { dataSource } = fakeDataSource();
      const original = driverError('23505');
      const thrown = await new TransactionRunner(dataSource)
        .run(async () => {
          throw original;
        })
        .catch((e: unknown) => e);
      expect(thrown).toBe(original);
      expect(translateConcurrencyError(null)).toBeNull();
    });
  });
});
