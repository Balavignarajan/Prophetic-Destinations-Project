import {
  Controller,
  Get,
  Header,
  Param,
  ParseEnumPipe,
  ParseIntPipe,
  ParseUUIDPipe,
  Query,
} from '@nestjs/common';
import {
  LEARNING_LEVELS,
  type LearningLevel,
} from '../../../shared-kernel/index.js';
import { Roles } from '../../identity/index.js';
import { PublicationService } from '../application/publication.service.js';
import { READ_ROLES } from '../domain/roles.js';
import {
  LevelSnapshotDto,
  PublicationDto,
  PublicationListDto,
} from './dto/publication.dto.js';
import { ListEventsQueryDto } from './dto/workflow.dto.js';

const DEFAULT_LIMIT = 50;
const LEVEL_VALUES = Object.fromEntries(
  LEARNING_LEVELS.map((level) => [level, level]),
);

/**
 * Publication history of one lesson, newest version first. Read-only: publications are
 * created and ended only by the workflow actions, and are never deleted. This is the admin
 * view; learners get published content through the Delivery module, which comes later.
 */
@Controller('admin/lessons/:lessonId/publications')
export class PublicationsController {
  constructor(private readonly publications: PublicationService) {}

  @Get()
  @Roles(...READ_ROLES)
  @Header('Cache-Control', 'no-store')
  async list(
    @Param('lessonId', ParseUUIDPipe) lessonId: string,
    @Query() query: ListEventsQueryDto,
  ): Promise<PublicationListDto> {
    const limit = query.limit ?? DEFAULT_LIMIT;
    const offset = query.offset ?? 0;
    const { items, total } = await this.publications.list(
      lessonId,
      limit,
      offset,
    );
    return {
      items: items.map((publication) => PublicationDto.from(publication)),
      total,
      limit,
      offset,
    };
  }

  @Get(':version')
  @Roles(...READ_ROLES)
  @Header('Cache-Control', 'no-store')
  async get(
    @Param('lessonId', ParseUUIDPipe) lessonId: string,
    @Param('version', ParseIntPipe) version: number,
  ): Promise<PublicationDto> {
    return PublicationDto.from(await this.publications.get(lessonId, version));
  }

  @Get(':version/levels/:level')
  @Roles(...READ_ROLES)
  @Header('Cache-Control', 'no-store')
  async snapshot(
    @Param('lessonId', ParseUUIDPipe) lessonId: string,
    @Param('version', ParseIntPipe) version: number,
    @Param('level', new ParseEnumPipe(LEVEL_VALUES)) level: LearningLevel,
  ): Promise<LevelSnapshotDto> {
    return LevelSnapshotDto.from(
      await this.publications.getSnapshot(lessonId, version, level),
    );
  }
}
