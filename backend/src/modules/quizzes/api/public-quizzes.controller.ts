import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';
import { Public } from '../../../platform/public.decorator.js';
import { BusinessRuleError, isLearningLevel } from '../../../shared-kernel/index.js';
import { QuizDeliveryService } from '../application/quiz-delivery.service.js';
import {
  type PublicQuizResponseDto,
  SubmissionDto,
  type SubmissionResultDto,
} from './dto/quiz.dto.js';

/**
 * The anonymous learner side of quizzes: read a published quiz, and check answers. Rate limited like the rest of the
 * public API; `no-store` on every response (see no-store.middleware.ts). A learner payload never contains the correct
 * option or the explanation: those appear only in the result of a submission.
 */
/**
 * Optional `?level=`: with it only the questions enabled at that level are returned/scored (the lesson snapshot is the normal way learners get a quiz, and
 * is already filtered per level). Without it every question is returned, as before.
 */
function levelOf(level: string | undefined): string | undefined {
  if (level === undefined) return undefined;
  if (!isLearningLevel(level)) throw new BusinessRuleError('level must be BEGINNER, INTERMEDIATE or ADVANCED', { code: 'INVALID_LEVEL' });
  return level;
}

@Public()
@UseGuards(ThrottlerGuard)
@Controller('quizzes')
export class PublicQuizzesController {
  constructor(private readonly delivery: QuizDeliveryService) {}

  @Get(':quizId')
  read(
    @Param('quizId', ParseUUIDPipe) quizId: string,
    @Query('level') level?: string,
  ): Promise<PublicQuizResponseDto> {
    return this.delivery.read(quizId, levelOf(level));
  }

  /** Stateless: scores the answers and returns the result; nothing is stored. */
  @Post(':quizId/submissions')
  @HttpCode(200)
  submit(
    @Param('quizId', ParseUUIDPipe) quizId: string,
    @Body() dto: SubmissionDto,
    @Query('level') level?: string,
  ): Promise<SubmissionResultDto> {
    return this.delivery.submit(quizId, dto.answers, levelOf(level));
  }
}
