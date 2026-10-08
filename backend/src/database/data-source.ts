import { loadConfig } from '../config/load-config.js';
import { createCliDataSource } from './cli-data-source.js';

/**
 * TypeORM CLI entry point for the DATABASE_URL branch (the `migration:*` npm
 * scripts, which build first).
 */
export default createCliDataSource(loadConfig().databaseUrl);
