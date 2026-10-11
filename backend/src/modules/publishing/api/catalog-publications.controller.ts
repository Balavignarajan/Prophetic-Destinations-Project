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
import { CatalogHistoryService } from '../application/catalog-history.service.js';
import { READ_ROLES } from '../domain/roles.js';
import {
  CatalogLevelSnapshotDto,
  CatalogPublicationDto,
  CatalogPublicationListDto,
} from './dto/catalog.dto.js';
import { ListEventsQueryDto } from './dto/workflow.dto.js';

const DEFAULT_LIMIT = 50;
const LEVEL_VALUES = Object.fromEntries(
  LEARNING_LEVELS.map((level) => [level, level]),
);

/**
 * Catalog publication history of one course, newest version first. Read-only: catalog versions are created and
 * ended only by the course and module workflow actions, and are never deleted. Admin view only.
 */
@Controller('admin/courses/:courseId/publications')
export class CatalogPublicationsController {
  constructor(private readonly history: CatalogHistoryService) {}

  @Get()
  @Roles(...READ_ROLES)
  @Header('Cache-Control', 'no-store')
  async list(
    @Param('courseId', ParseUUIDPipe) courseId: string,
    @Query() query: ListEventsQueryDto,
  ): Promise<CatalogPublicationListDto> {
    const limit = query.limit ?? DEFAULT_LIMIT;
    const offset = query.offset ?? 0;
    const { items, total } = await this.history.list(courseId, limit, offset);
    return {
      items: items.map((publication) =>
        CatalogPublicationDto.from(publication),
      ),
      total,
      limit,
      offset,
    };
  }

  @Get(':version')
  @Roles(...READ_ROLES)
  @Header('Cache-Control', 'no-store')
  async get(
    @Param('courseId', ParseUUIDPipe) courseId: string,
    @Param('version', ParseIntPipe) version: number,
  ): Promise<CatalogPublicationDto> {
    return CatalogPublicationDto.from(
      await this.history.get(courseId, version),
    );
  }

  @Get(':version/levels/:level')
  @Roles(...READ_ROLES)
  @Header('Cache-Control', 'no-store')
  async snapshot(
    @Param('courseId', ParseUUIDPipe) courseId: string,
    @Param('version', ParseIntPipe) version: number,
    @Param('level', new ParseEnumPipe(LEVEL_VALUES)) level: LearningLevel,
  ): Promise<CatalogLevelSnapshotDto> {
    return CatalogLevelSnapshotDto.from(
      await this.history.getSnapshot(courseId, version, level),
    );
  }
}
