import {
  type MiddlewareConsumer,
  Module,
  type NestModule,
} from '@nestjs/common';
import { ThrottlerModule } from '@nestjs/throttler';
import { APP_CONFIG, type AppConfig } from '../../config/index.js';
import { noStore } from './api/no-store.middleware.js';
import { PublicQuizzesController } from './api/public-quizzes.controller.js';
import { QuizzesController } from './api/quizzes.controller.js';
import { QuizDeliveryService } from './application/quiz-delivery.service.js';
import { QuizService } from './application/quiz.service.js';
import { QuizRepository } from './persistence/quiz.repository.js';

/**
 * Basic quizzes. Staff author them (`/admin/quizzes`); learners read published ones and check answers
 * (`/quizzes`). Quizzes are not part of lesson snapshots: the QUIZ lesson-block type is not enabled, so nothing in a
 * lesson refers to a quiz yet. When that block contract exists, a lesson snapshot will embed the quiz as published
 * at that moment and these standalone public routes become optional.
 */
@Module({
  imports: [
    // The learner routes have the public limiter (PUBLIC_RATE_LIMIT), applied by an explicit guard, per client IP.
    ThrottlerModule.forRootAsync({
      inject: [APP_CONFIG],
      useFactory: (config: AppConfig) => ({
        throttlers: [
          {
            ttl: config.publicRateWindowSeconds * 1000,
            limit: config.publicRateLimit,
          },
        ],
      }),
    }),
  ],
  controllers: [QuizzesController, PublicQuizzesController],
  providers: [QuizRepository, QuizService, QuizDeliveryService],
})
export class QuizzesModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(noStore).forRoutes(PublicQuizzesController);
  }
}
