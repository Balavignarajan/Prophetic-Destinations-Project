import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DataSource } from 'typeorm';
import { loadConfig } from '../config/load-config.js';

/**
 * Entry point for the TypeORM CLI (migrations only). The app itself connects
 * through DatabaseModule. Run via the `migration:*` npm scripts, which build first.
 */
export default new DataSource({
  type: 'postgres',
  url: loadConfig().databaseUrl,
  entities: [
    join(
      dirname(fileURLToPath(import.meta.url)),
      '..',
      'modules',
      '**',
      '*.entity.js',
    ),
  ],
  migrations: [
    join(dirname(fileURLToPath(import.meta.url)), 'migrations', '*.js'),
  ],
  synchronize: false,
});
