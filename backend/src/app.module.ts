import { Module } from '@nestjs/common';
import { ConfigModule } from './config/index.js';
import { DatabaseModule } from './database/database.module.js';
import { AssessmentsModule } from './modules/assessments/index.js';
import { CurriculumModule } from './modules/curriculum/index.js';
import { DeliveryModule } from './modules/delivery/index.js';
import { HealthModule } from './modules/health/index.js';
import { IdentityModule } from './modules/identity/index.js';
import { LessonsModule } from './modules/lessons/index.js';
import { MediaModule } from './modules/media/index.js';
import { PublishingModule } from './modules/publishing/index.js';
import { QuizzesModule } from './modules/quizzes/index.js';
import { ScriptureModule } from './modules/scripture/index.js';

@Module({
  imports: [
    ConfigModule,
    DatabaseModule,
    HealthModule,
    IdentityModule,
    CurriculumModule,
    LessonsModule,
    ScriptureModule,
    MediaModule,
    QuizzesModule,
    AssessmentsModule,
    PublishingModule,
    DeliveryModule,
  ],
})
export class AppModule {}
