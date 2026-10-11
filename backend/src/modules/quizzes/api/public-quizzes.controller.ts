import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';
import { Public } from '../../../platform/public.decorator.js';
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
@Public()
@UseGuards(ThrottlerGuard)
@Controller('quizzes')
export class PublicQuizzesController {
  constructor(private readonly delivery: QuizDeliveryService) {}

  @Get(':quizId')
  read(
    @Param('quizId', ParseUUIDPipe) quizId: string,
  ): Promise<PublicQuizResponseDto> {
    return this.delivery.read(quizId);
  }

  /** Stateless: scores the answers and returns the result; nothing is stored. */
  @Post(':quizId/submissions')
  @HttpCode(200)
  submit(
    @Param('quizId', ParseUUIDPipe) quizId: string,
    @Body() dto: SubmissionDto,
  ): Promise<SubmissionResultDto> {
    return this.delivery.submit(quizId, dto.answers);
  }
}
