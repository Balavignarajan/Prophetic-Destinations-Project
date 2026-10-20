import { Controller, Get, Header, Param, ParseUUIDPipe, Query } from '@nestjs/common';
import { Roles } from '../../identity/index.js';
import { BusinessRuleError, isLearningLevel } from '../../../shared-kernel/index.js';
import { type ExploringPreview, ExploringPreviewService } from '../application/exploring-preview.service.js';
import { READ_ROLES } from '../domain/roles.js';

/** Admin-only, read-only working preview of a Continue Exploring block. Learner delivery is a separate, public, published-only endpoint. */
@Controller('admin/lessons/:lessonId/blocks/:blockId/exploring-preview')
export class ExploringPreviewController {
  constructor(private readonly preview: ExploringPreviewService) {}

  @Get()
  @Roles(...READ_ROLES)
  @Header('Cache-Control', 'no-store')
  get(
    @Param('lessonId', ParseUUIDPipe) lessonId: string,
    @Param('blockId', ParseUUIDPipe) blockId: string,
    @Query('level') level?: string,
  ): Promise<ExploringPreview> {
    if (!isLearningLevel(level)) throw new BusinessRuleError('level must be BEGINNER, INTERMEDIATE or ADVANCED', { code: 'INVALID_LEVEL' });
    return this.preview.preview(lessonId, blockId, level);
  }
}
