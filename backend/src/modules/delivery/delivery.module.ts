import {
  type MiddlewareConsumer,
  Module,
  type NestModule,
} from '@nestjs/common';
import { ThrottlerModule } from '@nestjs/throttler';
import { APP_CONFIG, type AppConfig } from '../../config/index.js';
import { PublishingModule } from '../publishing/index.js';
import { LessonDeliveryController } from './api/lesson-delivery.controller.js';
import { noStore } from './api/no-store.middleware.js';
import { LessonDeliveryService } from './application/lesson-delivery.service.js';

/**
 * The learner-facing read API. It owns no tables and no authoring knowledge: it serves what
 * Publishing says is currently published, through Publishing's facade only.
 *
 * Phase 4A: one anonymous endpoint, `GET /api/v1/lessons/:lessonId?level=`. There are deliberately
 * no listing, search, catalog, sync or download endpoints yet.
 */
@Module({
  imports: [
    PublishingModule,
    // The public learner API has its own limiter, separate from login/refresh. It is applied by an
    // explicit ThrottlerGuard on the controller (never globally), per client IP.
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
  controllers: [LessonDeliveryController],
  providers: [LessonDeliveryService],
})
export class DeliveryModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(noStore).forRoutes(LessonDeliveryController);
  }
}
