import { type MiddlewareConsumer, Module, type NestModule } from '@nestjs/common';
import { ThrottlerModule } from '@nestjs/throttler';
import { APP_CONFIG, type AppConfig } from '../../config/index.js';
import { noStore } from './api/no-store.middleware.js';
import { AssessmentsController } from './api/assessments.controller.js';
import { PublicAssessmentsController } from './api/public-assessments.controller.js';
import { AssessmentDeliveryService } from './application/assessment-delivery.service.js';
import { AssessmentService } from './application/assessment.service.js';
import { AssessmentRepository } from './persistence/assessment.repository.js';

/**
 * The optional placement assessment that recommends a learning level. Staff author, review and publish it (`/admin/assessments`); the mobile app reads the
 * active published version and gets a recommendation for its answers (`/assessments`). Independent of lesson quizzes (its own schema and rules). Nothing
 * about learners is stored: the app keeps the chosen level and the result on the device.
 */
@Module({
  imports: [
    // The learner routes use the public limiter (PUBLIC_RATE_LIMIT), applied by an explicit guard, per client IP.
    ThrottlerModule.forRootAsync({
      inject: [APP_CONFIG],
      useFactory: (config: AppConfig) => ({ throttlers: [{ ttl: config.publicRateWindowSeconds * 1000, limit: config.publicRateLimit }] }),
    }),
  ],
  controllers: [AssessmentsController, PublicAssessmentsController],
  providers: [AssessmentRepository, AssessmentService, AssessmentDeliveryService],
})
export class AssessmentsModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(noStore).forRoutes(PublicAssessmentsController, AssessmentsController);
  }
}
