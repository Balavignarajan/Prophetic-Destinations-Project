import { Logger, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { HealthController } from './health.controller.js';

try {
  process.loadEnvFile('.env');
} catch {
  // .env is optional; DATABASE_URL may come from the real environment
}

@Module({
  imports: [
    TypeOrmModule.forRootAsync({
      useFactory: () => ({
        type: 'postgres' as const,
        url: process.env.DATABASE_URL,
        synchronize: false,
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
  controllers: [AppController, HealthController],
  providers: [AppService],
})
export class AppModule {}
