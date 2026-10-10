import { Injectable } from '@nestjs/common';
import { LessonsFacade } from '../../lessons/index.js';
import {
  type ReadinessReport,
  evaluateReadiness,
} from '../domain/readiness.js';

/**
 * An advisory readiness check. It reads the lesson without locking, so under
 * concurrent edits it can mix old and new data, and a clean report does not
 * make a lesson publishable: publishing re-checks readiness on a consistent,
 * locked state and is the only authority.
 */
@Injectable()
export class ReadinessService {
  constructor(private readonly lessons: LessonsFacade) {}

  async check(lessonId: string): Promise<ReadinessReport> {
    return evaluateReadiness(
      await this.lessons.assembleForPublication(lessonId),
    );
  }
}
