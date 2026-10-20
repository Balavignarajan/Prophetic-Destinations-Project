import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, UseGuards } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';
import { Public } from '../../../platform/public.decorator.js';
import { AssessmentDeliveryService } from '../application/assessment-delivery.service.js';
import { type AttemptResultResponseDto, type PublicAssessmentResponseDto, SubmitAttemptDto } from './dto/assessment.dto.js';

/**
 * The anonymous learner side of the placement assessment: read the ACTIVE published assessment, and get a recommendation for a set of answers. Rate limited
 * like the rest of the public API, `no-store` on every response. Stateless: no account, and nothing about an attempt is stored. A payload never contains
 * points, the scoring configuration or any editorial data; the recommended level is computed here from the stored scoring, never taken from the client.
 */
@Public()
@UseGuards(ThrottlerGuard)
@Controller('assessments')
export class PublicAssessmentsController {
  constructor(private readonly delivery: AssessmentDeliveryService) {}

  /** 404 with `details.reason = "ASSESSMENT_UNAVAILABLE"` when no assessment is published. */
  @Get('active')
  active(): Promise<PublicAssessmentResponseDto> {
    return this.delivery.getActive();
  }

  @Post(':assessmentId/submissions')
  @HttpCode(200)
  submit(@Param('assessmentId', ParseUUIDPipe) assessmentId: string, @Body() dto: SubmitAttemptDto): Promise<AttemptResultResponseDto> {
    return this.delivery.submit(assessmentId, dto.version, dto.answers);
  }
}
