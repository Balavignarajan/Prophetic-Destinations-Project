import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { DataSource } from 'typeorm';

@Controller('health')
export class HealthController {
  constructor(private readonly dataSource: DataSource) {}

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
