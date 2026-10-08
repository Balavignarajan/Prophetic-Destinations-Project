import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DataSource } from 'typeorm';

const here = dirname(fileURLToPath(import.meta.url));

/** Builds the DataSource the TypeORM CLI uses for migrations (never used by the running app). */
export function createCliDataSource(url: string): DataSource {
  return new DataSource({
    type: 'postgres',
    url,
    entities: [join(here, '..', 'modules', '**', '*.entity.js')],
    migrations: [join(here, 'migrations', '*.js')],
    synchronize: false,
  });
}
