import { Global, Logger, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { APP_CONFIG, type AppConfig } from '../config/index.js';
import { TransactionRunner } from './transaction-runner.js';

@Global()
@Module({
  imports: [
    TypeOrmModule.forRootAsync({
      inject: [APP_CONFIG],
      useFactory: (config: AppConfig) => ({
        type: 'postgres' as const,
        url: config.databaseUrl,
        // Each module registers its own entities via TypeOrmModule.forFeature.
        autoLoadEntities: true,
        // Schema changes happen through migrations only.
        synchronize: false,
        migrationsRun: false,
      }),
      dataSourceFactory: async (options) => {
        const logger = new Logger('Database');
        const dataSource = new DataSource(options!);
        try {
          await dataSource.initialize();
          logger.log('🟢 PostgreSQL database connected successfully');
          return dataSource;
        } catch (error) {
          logger.error(
            `🔴 PostgreSQL database connection failed (${(error as Error).message})`,
          );
          throw error;
        }
      },
    }),
  ],
  providers: [TransactionRunner],
  exports: [TransactionRunner],
})
export class DatabaseModule {}
