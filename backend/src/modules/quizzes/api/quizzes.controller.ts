import {
  Body,
  Controller,
  Delete,
  Get,
  Header,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import {
  type AuthenticatedAdmin,
  CurrentAdmin,
  Roles,
} from '../../identity/index.js';
import { QuizService } from '../application/quiz.service.js';
import {
  AdminQuizResponseDto,
  CreateQuizDto,
  ListQuizzesQueryDto,
  QuizListResponseDto,
  QuizSummaryDto,
  UpdateQuizDto,
} from './dto/quiz.dto.js';
import {
  DELETE_ROLES,
  PUBLISH_ROLES,
  READ_ROLES,
  WRITE_ROLES,
} from './roles.js';

const DEFAULT_LIMIT = 50;

/** Staff authoring of quizzes. Responses include the correct answers, so they are never cached. */
@Controller('admin/quizzes')
export class QuizzesController {
  constructor(private readonly quizzes: QuizService) {}

  @Post()
  @Roles(...WRITE_ROLES)
  @Header('Cache-Control', 'no-store')
  async create(
    @CurrentAdmin() actor: AuthenticatedAdmin,
    @Body() dto: CreateQuizDto,
  ): Promise<AdminQuizResponseDto> {
    return AdminQuizResponseDto.from(await this.quizzes.create(actor.id, dto));
  }

  @Get()
  @Roles(...READ_ROLES)
  @Header('Cache-Control', 'no-store')
  async list(
    @Query() query: ListQuizzesQueryDto,
  ): Promise<QuizListResponseDto> {
    const limit = query.limit ?? DEFAULT_LIMIT;
    const offset = query.offset ?? 0;
    const { items, total } = await this.quizzes.list(limit, offset);
    return {
      items: items.map((quiz) => QuizSummaryDto.from(quiz)),
      total,
      limit,
      offset,
    };
  }

  @Get(':quizId')
  @Roles(...READ_ROLES)
  @Header('Cache-Control', 'no-store')
  async get(
    @Param('quizId', ParseUUIDPipe) quizId: string,
  ): Promise<AdminQuizResponseDto> {
    return AdminQuizResponseDto.from(await this.quizzes.get(quizId));
  }

  @Put(':quizId')
  @Roles(...WRITE_ROLES)
  @Header('Cache-Control', 'no-store')
  async update(
    @Param('quizId', ParseUUIDPipe) quizId: string,
    @Body() dto: UpdateQuizDto,
  ): Promise<AdminQuizResponseDto> {
    return AdminQuizResponseDto.from(
      await this.quizzes.update(quizId, dto, dto.version),
    );
  }

  @Post(':quizId/publish')
  @HttpCode(200)
  @Roles(...PUBLISH_ROLES)
  @Header('Cache-Control', 'no-store')
  async publish(
    @Param('quizId', ParseUUIDPipe) quizId: string,
  ): Promise<AdminQuizResponseDto> {
    return AdminQuizResponseDto.from(await this.quizzes.publish(quizId));
  }

  @Post(':quizId/unpublish')
  @HttpCode(200)
  @Roles(...PUBLISH_ROLES)
  @Header('Cache-Control', 'no-store')
  async unpublish(
    @Param('quizId', ParseUUIDPipe) quizId: string,
  ): Promise<AdminQuizResponseDto> {
    return AdminQuizResponseDto.from(await this.quizzes.unpublish(quizId));
  }

  @Delete(':quizId')
  @HttpCode(204)
  @Roles(...DELETE_ROLES)
  async delete(@Param('quizId', ParseUUIDPipe) quizId: string): Promise<void> {
    await this.quizzes.delete(quizId);
  }
}
