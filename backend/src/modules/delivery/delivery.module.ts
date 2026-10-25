import {
  type MiddlewareConsumer,
  Module,
  type NestModule,
} from '@nestjs/common';
import { ThrottlerModule } from '@nestjs/throttler';
import { APP_CONFIG, type AppConfig } from '../../config/index.js';
import { MediaModule } from '../media/index.js';
import { PublishingModule } from '../publishing/index.js';
import { CourseDeliveryController } from './api/course-delivery.controller.js';
import { HomeEntryDeliveryController } from './api/home-entry-delivery.controller.js';
import { LessonDeliveryController } from './api/lesson-delivery.controller.js';
import { noStore } from './api/no-store.middleware.js';
import { CatalogDeliveryService } from './application/catalog-delivery.service.js';
import { LessonDeliveryService } from './application/lesson-delivery.service.js';
import { LessonMediaDeliveryService } from './application/lesson-media-delivery.service.js';

/**
 * The learner-facing read API. It owns no tables and no authoring knowledge: it serves what
 * Publishing says is currently published, through Publishing's facade only.
 *
 * Anonymous, read-only routes only: `GET /api/v1/lessons/:lessonId?level=` (Phase 4A), the published catalog
 * `GET /api/v1/courses?level=` and `GET /api/v1/courses/:courseId?level=`, the lesson navigation
 * `GET /api/v1/lessons/:lessonId/navigation?level=`, and an image of a published lesson
 * `GET /api/v1/lessons/:lessonId/media/:mediaId?level=` (only for images inside the active snapshot), and the Home topics
 * `GET /api/v1/home-entries?level=`, the courses in one `GET /api/v1/home-entries/:entryId/courses?level=` and a card's own picture `GET /api/v1/home-entries/:entryId/media/:mediaId?level=`. There are deliberately no search, sync or download endpoints.
 */
@Module({
  imports: [
    PublishingModule,
    MediaModule,
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
  controllers: [LessonDeliveryController, CourseDeliveryController, HomeEntryDeliveryController],
  providers: [
    LessonDeliveryService,
    CatalogDeliveryService,
    LessonMediaDeliveryService,
  ],
})
export class DeliveryModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer
      .apply(noStore)
      .forRoutes(LessonDeliveryController, CourseDeliveryController, HomeEntryDeliveryController);
  }
}
