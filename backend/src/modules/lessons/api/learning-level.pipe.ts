import { BadRequestException, type PipeTransform } from '@nestjs/common';
import {
  LEARNING_LEVELS,
  type LearningLevel,
  isLearningLevel,
} from '../../../shared-kernel/index.js';

/** Turns a `:level` path segment into a LearningLevel; anything else (including lower case) is a 400. */
export class LearningLevelPipe implements PipeTransform<string, LearningLevel> {
  transform(value: string): LearningLevel {
    if (!isLearningLevel(value)) {
      throw new BadRequestException(
        `level must be one of ${LEARNING_LEVELS.join(', ')}`,
      );
    }
    return value;
  }
}
