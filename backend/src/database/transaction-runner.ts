import { Injectable } from '@nestjs/common';
import { DataSource, type EntityManager } from 'typeorm';

/**
 * Runs a use case inside one database transaction.
 * The EntityManager is passed explicitly to repositories, so it is always
 * visible which writes share a transaction. Reads usually run outside one.
 */
@Injectable()
export class TransactionRunner {
  constructor(private readonly dataSource: DataSource) {}

  run<T>(work: (manager: EntityManager) => Promise<T>): Promise<T> {
    return this.dataSource.transaction(work);
  }
}
