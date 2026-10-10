import { Controller, Get, Header, Param, ParseUUIDPipe } from '@nestjs/common';
import { Roles } from '../../identity/index.js';
import { ReadinessService } from '../application/readiness.service.js';
import type { ReadinessReport } from '../domain/readiness.js';
import { READ_ROLES } from '../domain/roles.js';

/** Read-only and advisory: publishing re-checks readiness on a locked, consistent state. */
@Controller('admin/lessons/:lessonId/readiness')
export class ReadinessController {
  constructor(private readonly readiness: ReadinessService) {}

  @Get()
  @Roles(...READ_ROLES)
  @Header('Cache-Control', 'no-store')
  check(
    @Param('lessonId', ParseUUIDPipe) lessonId: string,
  ): Promise<ReadinessReport> {
    return this.readiness.check(lessonId);
  }
}
