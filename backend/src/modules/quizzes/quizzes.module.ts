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
import { QuizzesFacade } from './application/quizzes.facade.js';
import { QuizRepository } from './persistence/quiz.repository.js';

/**
 * Basic quizzes. Staff author them (`/admin/quizzes`); learners read published ones and check answers
 * (`/quizzes`). A lesson can include a quiz through a QUIZ block (a reference); at publication the lesson snapshot
 * embeds a frozen copy of the quiz (see lessons/application/quiz-embed.service.ts). These standalone routes keep working and are
 * independent of that copy.
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
  providers: [QuizRepository, QuizService, QuizDeliveryService, QuizzesFacade],
  exports: [QuizzesFacade],
})
export class QuizzesModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(noStore).forRoutes(PublicQuizzesController);
  }
}
