import { Body, Controller, Get, Header, HttpCode, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { type AuthenticatedAdmin, CurrentAdmin, Roles } from '../../identity/index.js';
import { LessonRevisionService } from '../application/lesson-revision.service.js';
import { LessonRevisionHistoryDto, RestoreRevisionDto, RestoreRevisionResponseDto } from './dto/lesson-revision.dto.js';
import { READ_ROLES, WRITE_ROLES } from './roles.js';

/**
 * The draft history of one lesson (CMS-029). Staff only. Reading follows the lesson read roles; restoring follows the lesson write roles. Restoring changes the lesson's
 * working draft only: no published snapshot is read or written, and nothing is published.
 */
@Controller('admin/lessons/:lessonId/revisions')
export class LessonRevisionsController {
  constructor(private readonly revisions: LessonRevisionService) {}

  /** The stored draft revisions, newest first, and where the lesson stands now. */
  @Get()
  @Roles(...READ_ROLES)
  @Header('Cache-Control', 'no-store')
  async history(@Param('lessonId', ParseUUIDPipe) lessonId: string): Promise<LessonRevisionHistoryDto> {
    return LessonRevisionHistoryDto.from(await this.revisions.history(lessonId));
  }

  /** Makes the revision the lesson's current draft (the lesson returns to Draft). Reversible: the draft it replaces is kept as a revision. */
  @Post(':revisionId/restore')
  @HttpCode(200)
  @Roles(...WRITE_ROLES)
  @Header('Cache-Control', 'no-store')
  async restore(
    @CurrentAdmin() actor: AuthenticatedAdmin,
    @Param('lessonId', ParseUUIDPipe) lessonId: string,
    @Param('revisionId', ParseUUIDPipe) revisionId: string,
    @Body() dto: RestoreRevisionDto,
  ): Promise<RestoreRevisionResponseDto> {
    return RestoreRevisionResponseDto.from(await this.revisions.restore(actor.id, lessonId, revisionId, dto.expectedContentRevision));
  }
}
