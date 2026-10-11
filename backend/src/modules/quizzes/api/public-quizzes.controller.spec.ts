import { ThrottlerGuard } from '@nestjs/throttler';
import { IS_PUBLIC_KEY } from '../../../platform/public.decorator.js';
import { PublicQuizzesController } from './public-quizzes.controller.js';
import { QuizzesController } from './quizzes.controller.js';

describe('quiz controllers', () => {
  it('the learner controller is public and rate limited by an explicit guard', () => {
    expect(Reflect.getMetadata(IS_PUBLIC_KEY, PublicQuizzesController)).toBe(
      true,
    );
    expect(
      Reflect.getMetadata('__guards__', PublicQuizzesController),
    ).toContain(ThrottlerGuard);
  });

  it('the authoring controller is not public and has no learner-only guard', () => {
    expect(
      Reflect.getMetadata(IS_PUBLIC_KEY, QuizzesController),
    ).toBeUndefined();
  });
});
