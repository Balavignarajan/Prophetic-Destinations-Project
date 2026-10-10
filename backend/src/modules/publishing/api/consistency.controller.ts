import { Controller, Get, Header, Query } from '@nestjs/common';
import { Transform, Type } from 'class-transformer';
import { IsBoolean, IsInt, IsOptional, Max, Min } from 'class-validator';
import { Role, Roles } from '../../identity/index.js';
import {
  ConsistencyService,
  type ConsistencyReport,
} from '../application/consistency.service.js';

export class ConsistencyQueryDto {
  /** Also re-hash and re-measure every stored snapshot (reads all snapshots: slow on a large history). */
  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    value === 'true' ? true : value === 'false' ? false : value,
  )
  @IsBoolean()
  verifySnapshots?: boolean;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(1000)
  limit?: number;
}

/**
 * Read-only integrity report for publishing, for operators. It reports and never repairs.
 * ADMIN only: it spans every lesson.
 */
@Controller('admin/publishing/consistency')
export class ConsistencyController {
  constructor(private readonly consistency: ConsistencyService) {}

  @Get()
  @Roles(Role.ADMIN)
  @Header('Cache-Control', 'no-store')
  report(@Query() query: ConsistencyQueryDto): Promise<ConsistencyReport> {
    return this.consistency.check({
      verifySnapshots: query.verifySnapshots,
      limitPerCheck: query.limit,
    });
  }
}
