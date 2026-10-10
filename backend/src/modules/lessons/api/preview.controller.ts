import {
  Controller,
  Get,
  Header,
  Param,
  ParseUUIDPipe,
  Query,
} from '@nestjs/common';
import { Roles } from '../../identity/index.js';
import { PreviewService } from '../application/preview.service.js';
import { PreviewQueryDto, PreviewResponseDto } from './dto/preview.dto.js';
import { READ_ROLES } from './roles.js';

/** Read-only: shows a lesson as a learner at one level would see it. Advisory, not a publish check. */
@Controller('admin/lessons/:lessonId/preview')
export class PreviewController {
  constructor(private readonly previews: PreviewService) {}

  @Get()
  @Roles(...READ_ROLES)
  @Header('Cache-Control', 'no-store')
  async preview(
    @Param('lessonId', ParseUUIDPipe) lessonId: string,
    @Query() query: PreviewQueryDto,
  ): Promise<PreviewResponseDto> {
    return PreviewResponseDto.from(
      await this.previews.preview(lessonId, query.level),
    );
  }
}
