import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { DataSource } from 'typeorm';

@Controller('health')
export class HealthController {
  constructor(private readonly dataSource: DataSource) {}

  /** Liveness: the process is up. Does not touch the database. */
  @Get()
  live() {
    return { status: 'ok' };
  }

  /** Readiness: the database answers. */
  @Get('db')
  async db() {
    try {
      await this.dataSource.query('SELECT 1');
      return { database: 'connected' };
    } catch {
      throw new ServiceUnavailableException({ database: 'disconnected' });
    }
  }
}
