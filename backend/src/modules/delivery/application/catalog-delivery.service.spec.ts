import { randomUUID } from 'node:crypto';
import { NotFoundError } from '../../../shared-kernel/index.js';
import type {
  LessonNavigation,
  PublishedCourseView,
  PublishingFacade,
} from '../../publishing/index.js';
import { CatalogDeliveryService } from './catalog-delivery.service.js';

const lessonItem = (
  n: number,
  previous: string | null,
  next: string | null,
) => ({
  lessonId: `lesson-${n}`,
  moduleId: 'module-1',
  title: `Lesson ${n}`,
  shortTitle: null,
  subtitle: null,
  estimatedMinutes: 5,
  previousLessonId: previous,
  nextLessonId: next,
});

function view(
  overrides: Partial<PublishedCourseView> = {},
): PublishedCourseView {
  return {
    courseId: randomUUID(),
    level: 'BEGINNER',
    catalogVersion: 2,
    title: 'Course',
    description: null,
    moduleCount: 1,
    lessonCount: 2,
    modules: [
      {
        moduleId: 'module-1',
        title: 'Module',
        description: null,
        lessons: [
          lessonItem(1, null, 'lesson-2'),
          lessonItem(2, 'lesson-1', null),
        ],
      },
    ],
    ...overrides,
  };
}

function service(facade: Partial<Record<keyof PublishingFacade, unknown>>) {
  return new CatalogDeliveryService(facade as unknown as PublishingFacade);
}

describe('CatalogDeliveryService', () => {
  describe('course list', () => {
    it('maps each published course to the documented list item, in the order given', async () => {
      const one = view({ title: 'One' });
      const two = view({ title: 'Two', moduleCount: 3, lessonCount: 9 });
      const result = await service({
        listPublishedCourses: async () => [one, two],
      }).listCourses('BEGINNER');

      expect(result.kind).toBe('OK');
      if (result.kind !== 'OK') return;
      expect(result.body).toEqual({
        level: 'BEGINNER',
        courses: [
          {
            courseId: one.courseId,
            catalogVersion: 2,
            title: 'One',
            description: null,
            moduleCount: 1,
            lessonCount: 2,
          },
          {
            courseId: two.courseId,
            catalogVersion: 2,
            title: 'Two',
            description: null,
            moduleCount: 3,
            lessonCount: 9,
          },
        ],
      });
      expect(JSON.stringify(result.body)).not.toContain('modules');
    });

    it('is an empty list, not an error, when nothing is published at the level', async () => {
      const result = await service({
        listPublishedCourses: async () => [],
      }).listCourses('ADVANCED');
      expect(result).toMatchObject({
        kind: 'OK',
        body: { level: 'ADVANCED', courses: [] },
      });
    });

    it('answers 304 only for exactly the same list, and a changed list changes the validator', async () => {
      const a = view();
      const facade = { listPublishedCourses: async () => [a] };
      const first = await service(facade).listCourses('BEGINNER');
      const again = await service(facade).listCourses('BEGINNER', first.etag);
      expect(again).toEqual({ kind: 'NOT_MODIFIED', etag: first.etag });

      const changed = await service({
        listPublishedCourses: async () => [{ ...a, lessonCount: 1 }],
      }).listCourses('BEGINNER', first.etag);
      expect(changed.kind).toBe('OK'); // a lesson was withdrawn: the old validator no longer matches
      expect(changed.etag).not.toBe(first.etag);

      const otherLevel = await service(facade).listCourses(
        'ADVANCED',
        first.etag,
      );
      expect(otherLevel.kind).toBe('OK');
    });
  });

  describe('course', () => {
    it('returns the course with modules, lessons and neighbours', async () => {
      const v = view();
      const result = await service({
        findPublishedCourse: async () => v,
      }).getCourse(v.courseId, 'BEGINNER');
      expect(result.kind).toBe('OK');
      if (result.kind !== 'OK') return;
      expect(Object.keys(result.body).sort()).toEqual(
        [
          'catalogVersion',
          'courseId',
          'description',
          'lessonCount',
          'level',
          'moduleCount',
          'modules',
          'title',
        ].sort(),
      );
      expect(
        result.body.modules[0].lessons.map((l) => [
          l.lessonId,
          l.previousLessonId,
          l.nextLessonId,
        ]),
      ).toEqual([
        ['lesson-1', null, 'lesson-2'],
        ['lesson-2', 'lesson-1', null],
      ]);
    });

    it('is a plain 404 when nothing is published, whatever validator the client sends', async () => {
      const svc = service({ findPublishedCourse: async () => null });
      await expect(
        svc.getCourse(randomUUID(), 'BEGINNER'),
      ).rejects.toBeInstanceOf(NotFoundError);
      await expect(
        svc.getCourse(randomUUID(), 'BEGINNER', '*'),
      ).rejects.toBeInstanceOf(NotFoundError);
      const error = await svc
        .getCourse(randomUUID(), 'BEGINNER')
        .catch((e: unknown) => e);
      expect((error as NotFoundError).details).toBeUndefined();
    });

    it('gives different courses and levels different validators even with otherwise identical content', async () => {
      const v = view();
      // like the real facade, the view names the course and level that were asked for
      const svc = service({
        findPublishedCourse: async (
          courseId: string,
          level: PublishedCourseView['level'],
        ) => ({
          ...v,
          courseId,
          level,
        }),
      });
      const tags = new Set([
        (await svc.getCourse('a', 'BEGINNER')).etag,
        (await svc.getCourse('b', 'BEGINNER')).etag,
        (await svc.getCourse('a', 'ADVANCED')).etag,
      ]);
      expect(tags.size).toBe(3);
    });

    it('revalidates with weak validators, lists and *', async () => {
      const v = view();
      const svc = service({ findPublishedCourse: async () => v });
      const { etag } = await svc.getCourse(v.courseId, 'BEGINNER');
      for (const header of [etag, `W/${etag}`, `"x", ${etag}`, '*']) {
        expect(
          (await svc.getCourse(v.courseId, 'BEGINNER', header)).kind,
          header,
        ).toBe('NOT_MODIFIED');
      }
      expect((await svc.getCourse(v.courseId, 'BEGINNER', '"nope"')).kind).toBe(
        'OK',
      );
      expect(
        (await svc.getCourse(v.courseId, 'BEGINNER', 'garbage')).kind,
      ).toBe('OK');
    });
  });

  describe('navigation', () => {
    const navigation = (): LessonNavigation => ({
      lessonId: 'lesson-2',
      level: 'BEGINNER',
      courseId: 'course-1',
      moduleId: 'module-1',
      catalogVersion: 3,
      previous: {
        lessonId: 'lesson-1',
        moduleId: 'module-1',
        title: 'One',
        shortTitle: null,
        subtitle: null,
        estimatedMinutes: 5,
      },
      next: null,
    });

    it('returns previous and next, null at an end', async () => {
      const result = await service({
        findLessonNavigation: async () => navigation(),
      }).getNavigation('lesson-2', 'BEGINNER');
      expect(result).toMatchObject({
        kind: 'OK',
        body: {
          lessonId: 'lesson-2',
          courseId: 'course-1',
          catalogVersion: 3,
          next: null,
          previous: { lessonId: 'lesson-1' },
        },
      });
    });

    it('is a plain 404 when the lesson has no place in a published catalog', async () => {
      await expect(
        service({ findLessonNavigation: async () => null }).getNavigation(
          'x',
          'BEGINNER',
          '*',
        ),
      ).rejects.toBeInstanceOf(NotFoundError);
    });

    it('changes its validator when a neighbour changes', async () => {
      const a = await service({
        findLessonNavigation: async () => navigation(),
      }).getNavigation('lesson-2', 'BEGINNER');
      const without = { ...navigation(), previous: null };
      const b = await service({
        findLessonNavigation: async () => without,
      }).getNavigation('lesson-2', 'BEGINNER', a.etag);
      expect(b.kind).toBe('OK');
    });
  });
});
