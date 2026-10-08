import type { DataSource, EntityManager } from 'typeorm';
import { TransactionRunner } from './transaction-runner.js';

describe('TransactionRunner', () => {
  it('passes the transaction manager to the work and returns its result', async () => {
    const manager = {} as EntityManager;
    const dataSource = {
      transaction: (work: (m: EntityManager) => Promise<unknown>) =>
        work(manager),
    } as unknown as DataSource;

    const result = await new TransactionRunner(dataSource).run(async (m) => {
      expect(m).toBe(manager);
      return 'done';
    });

    expect(result).toBe('done');
  });

  it('propagates failures so the transaction rolls back', async () => {
    const dataSource = {
      transaction: (work: (m: EntityManager) => Promise<unknown>) =>
        work({} as EntityManager),
    } as unknown as DataSource;

    await expect(
      new TransactionRunner(dataSource).run(async () => {
        throw new Error('boom');
      }),
    ).rejects.toThrow('boom');
  });
});
