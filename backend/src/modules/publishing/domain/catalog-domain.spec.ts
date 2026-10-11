import { randomUUID } from 'node:crypto';
import type { LearningLevel } from '../../../shared-kernel/index.js';
import {
  CATALOG_SNAPSHOT_SCHEMA_VERSION,
  type LessonSummary,
  type PublishedModuleEntry,
  buildCatalogLevels,
  evaluateCatalogReadiness,
  preserveOrder,
  serializeCatalogLevel,
} from './catalog-snapshot.js';
import {
  eligibleSequence,
  listedLessonIds,
  navigationFor,
  toCourseView,
} from './catalog-view.js';
import { planCatalogTransition } from './catalog-transition.js';
import { MAX_LEVEL_SNAPSHOT_BYTES } from './snapshot-payload.js';

const course = { id: randomUUID(), title: 'Course', description: null };
const module = (n: number, title = `Module ${n}`): PublishedModuleEntry => ({
  moduleId: `module-${n}`,
  position: n,
  title,
  description: n === 1 ? 'first module' : null,
});
const summary = (title: string): LessonSummary => ({
  title,
  shortTitle: null,
  subtitle: null,
  estimatedMinutes: 10,
});

/** lessonId -> level -> summary, from a compact description. */
function published(
  spec: Record<string, Partial<Record<LearningLevel, string>>>,
): Map<string, Map<LearningLevel, LessonSummary>> {
  return new Map(
    Object.entries(spec).map(([lessonId, levels]) => [
      lessonId,
      new Map(
        Object.entries(levels).map(([level, title]) => [
          level as LearningLevel,
          summary(title!),
        ]),
      ),
    ]),
  );
}

describe('buildCatalogLevels', () => {
  const placements = [
    { lessonId: 'l1', moduleId: 'module-1' },
    { lessonId: 'l2', moduleId: 'module-1' },
    { lessonId: 'l3', moduleId: 'module-2' },
  ];

  it('builds one snapshot per level that has a published lesson, never another level', () => {
    const levels = buildCatalogLevels({
      course,
      modules: [module(1), module(2)],
      placements,
      summaries: published({
        l1: { BEGINNER: 'L1', ADVANCED: 'L1 adv' },
        l3: { BEGINNER: 'L3' },
      }),
    });
    expect([...levels.keys()]).toEqual(['BEGINNER', 'ADVANCED']);
    expect(levels.has('INTERMEDIATE')).toBe(false);
  });

  it('lists only the lessons published at that level, in module then lesson order', () => {
    const levels = buildCatalogLevels({
      course,
      modules: [module(2), module(1)], // given out of order: the ordinals decide
      placements,
      summaries: published({
        l1: { BEGINNER: 'L1' },
        l2: { BEGINNER: 'L2', ADVANCED: 'L2 adv' },
        l3: { BEGINNER: 'L3' },
      }),
    });
    const beginner = levels.get('BEGINNER')!;
    expect(
      beginner.modules.map((m) => [m.id, m.lessons.map((l) => l.id)]),
    ).toEqual([
      ['module-1', ['l1', 'l2']],
      ['module-2', ['l3']],
    ]);
    expect(
      levels
        .get('ADVANCED')!
        .modules.map((m) => [m.id, m.lessons.map((l) => l.id)]),
    ).toEqual([['module-1', ['l2']]]);
  });

  it('takes summaries only from the published data it is given, and carries the module as published', () => {
    const levels = buildCatalogLevels({
      course: { id: course.id, title: 'Published title', description: 'd' },
      modules: [module(1, 'Published module title')],
      placements,
      summaries: published({ l1: { BEGINNER: 'Published lesson title' } }),
    });
    const content = levels.get('BEGINNER')!;
    expect(content.course).toEqual({
      id: course.id,
      title: 'Published title',
      description: 'd',
    });
    expect(content.modules[0]).toMatchObject({
      title: 'Published module title',
      description: 'first module',
    });
    expect(content.modules[0].lessons).toEqual([
      {
        id: 'l1',
        title: 'Published lesson title',
        shortTitle: null,
        subtitle: null,
        estimatedMinutes: 10,
      },
    ]);
    expect(content.schemaVersion).toBe(CATALOG_SNAPSHOT_SCHEMA_VERSION);
  });

  it('leaves out lessons without a published summary and modules left with no lesson at the level', () => {
    const levels = buildCatalogLevels({
      course,
      modules: [module(1), module(2)],
      placements,
      summaries: published({ l3: { BEGINNER: 'only in module 2' } }),
    });
    expect(levels.get('BEGINNER')!.modules.map((m) => m.id)).toEqual([
      'module-2',
    ]);
  });

  it('builds nothing for an empty course, an empty module list, or lessons that are not published', () => {
    expect(
      buildCatalogLevels({
        course,
        modules: [],
        placements,
        summaries: published({ l1: { BEGINNER: 'x' } }),
      }).size,
    ).toBe(0);
    expect(
      buildCatalogLevels({
        course,
        modules: [module(1)],
        placements: [],
        summaries: published({}),
      }).size,
    ).toBe(0);
    expect(
      buildCatalogLevels({
        course,
        modules: [module(1)],
        placements,
        summaries: published({}),
      }).size,
    ).toBe(0);
  });

  it('does not list a lesson of a module that is not in the version', () => {
    const levels = buildCatalogLevels({
      course,
      modules: [module(1)],
      placements,
      summaries: published({ l3: { BEGINNER: 'in an unlisted module' } }),
    });
    expect(levels.size).toBe(0);
  });
});

describe('serializeCatalogLevel and readiness', () => {
  const content = buildCatalogLevels({
    course,
    modules: [module(1)],
    placements: [{ lessonId: 'l1', moduleId: 'module-1' }],
    summaries: published({ l1: { BEGINNER: 'L1' } }),
  }).get('BEGINNER')!;

  it('gives a deterministic hash and size measured from the same canonical text', () => {
    const a = serializeCatalogLevel(content);
    const reordered = JSON.parse(JSON.stringify(content)) as typeof content;
    const b = serializeCatalogLevel({
      modules: reordered.modules,
      course: reordered.course,
      level: reordered.level,
      schemaVersion: reordered.schemaVersion,
    });
    expect(b.json).toBe(a.json);
    expect(b.hash).toBe(a.hash);
    expect(a.hash).toMatch(/^[0-9a-f]{64}$/);
    expect(a.bytes).toBe(Buffer.byteLength(a.json, 'utf8'));
  });

  it('changes the hash when anything in the level changes', () => {
    const base = serializeCatalogLevel(content).hash;
    const renamed = structuredClone(content);
    renamed.modules[0].lessons[0].title = 'changed';
    expect(serializeCatalogLevel(renamed).hash).not.toBe(base);
    expect(
      serializeCatalogLevel({ ...content, level: 'ADVANCED' }).hash,
    ).not.toBe(base);
  });

  it('is ready when there is something to show', () => {
    expect(evaluateCatalogReadiness([serializeCatalogLevel(content)])).toEqual({
      ready: true,
      issues: [],
    });
  });

  it('is not ready when no level has a published lesson', () => {
    const report = evaluateCatalogReadiness([]);
    expect(report.ready).toBe(false);
    expect(report.issues.map((i) => i.code)).toEqual(['NO_PUBLISHED_LESSONS']);
  });

  it('is not ready when a level snapshot exceeds the 5 MiB limit, naming the level', () => {
    const big = {
      ...serializeCatalogLevel(content),
      bytes: MAX_LEVEL_SNAPSHOT_BYTES + 1,
    };
    const exact = {
      ...serializeCatalogLevel({ ...content, level: 'ADVANCED' }),
      bytes: MAX_LEVEL_SNAPSHOT_BYTES,
    };
    const report = evaluateCatalogReadiness([big, exact]);
    expect(report.issues).toEqual([
      expect.objectContaining({
        code: 'SNAPSHOT_TOO_LARGE',
        level: 'BEGINNER',
      }),
    ]);
  });
});

describe('the learner view of a catalog snapshot', () => {
  // module-1: l1 l2, module-2: l3 l4, module-3: l5
  const content = buildCatalogLevels({
    course,
    modules: [module(1), module(2), module(3)],
    placements: ['l1', 'l2', 'l3', 'l4', 'l5'].map((id, i) => ({
      lessonId: id,
      moduleId: i < 2 ? 'module-1' : i < 4 ? 'module-2' : 'module-3',
    })),
    summaries: published(
      Object.fromEntries(
        ['l1', 'l2', 'l3', 'l4', 'l5'].map((id) => [
          id,
          { BEGINNER: id.toUpperCase() },
        ]),
      ),
    ),
  }).get('BEGINNER')!;
  const all = new Set(['l1', 'l2', 'l3', 'l4', 'l5']);

  it('lists every listed lesson when all are eligible, with next/previous across module boundaries', () => {
    const view = toCourseView(content, 4, all)!;
    expect(view).toMatchObject({
      courseId: course.id,
      level: 'BEGINNER',
      catalogVersion: 4,
      moduleCount: 3,
      lessonCount: 5,
    });
    const items = view.modules.flatMap((m) => m.lessons);
    expect(
      items.map((l) => [l.lessonId, l.previousLessonId, l.nextLessonId]),
    ).toEqual([
      ['l1', null, 'l2'],
      ['l2', 'l1', 'l3'],
      ['l3', 'l2', 'l4'],
      ['l4', 'l3', 'l5'],
      ['l5', 'l4', null],
    ]);
  });

  it('returns null at the first and last eligible lesson', () => {
    const first = navigationFor(content, 1, 'l1', all)!;
    const last = navigationFor(content, 1, 'l5', all)!;
    expect(first.previous).toBeNull();
    expect(first.next).toMatchObject({ lessonId: 'l2', moduleId: 'module-1' });
    expect(last.next).toBeNull();
    expect(last.previous).toMatchObject({
      lessonId: 'l4',
      moduleId: 'module-2',
    });
  });

  it('skips ineligible lessons, also across a module boundary, and never names them', () => {
    const eligible = new Set(['l1', 'l4', 'l5']); // l2 and l3 are not (withdrawn)
    expect(navigationFor(content, 1, 'l1', eligible)!.next).toMatchObject({
      lessonId: 'l4',
      moduleId: 'module-2',
    });
    expect(navigationFor(content, 1, 'l4', eligible)!.previous).toMatchObject({
      lessonId: 'l1',
    });
    const view = toCourseView(content, 1, eligible)!;
    expect(view.lessonCount).toBe(3);
    expect(JSON.stringify(view)).not.toMatch(/"l2"|"l3"/);
    expect(
      view.modules
        .flatMap((m) => m.lessons)
        .map((l) => [l.lessonId, l.previousLessonId, l.nextLessonId]),
    ).toEqual([
      ['l1', null, 'l4'],
      ['l4', 'l1', 'l5'],
      ['l5', 'l4', null],
    ]);
  });

  it('omits a module left without an eligible lesson, and the counts only count what is shown', () => {
    const view = toCourseView(content, 1, new Set(['l1', 'l2', 'l5']))!;
    expect(view.modules.map((m) => m.moduleId)).toEqual([
      'module-1',
      'module-3',
    ]);
    expect(view).toMatchObject({ moduleCount: 2, lessonCount: 3 });
  });

  it('has no view and no navigation when nothing is eligible, or the lesson itself is not', () => {
    expect(toCourseView(content, 1, new Set())).toBeNull();
    expect(navigationFor(content, 1, 'l3', new Set(['l1', 'l2']))).toBeNull();
    expect(navigationFor(content, 1, 'not-listed', all)).toBeNull();
  });

  it('ignores eligible lessons the snapshot does not list (a lesson published after the catalog)', () => {
    const view = toCourseView(content, 1, new Set([...all, 'l-new']))!;
    expect(view.lessonCount).toBe(5);
    expect(JSON.stringify(view)).not.toContain('l-new');
    expect(
      navigationFor(content, 1, 'l-new', new Set([...all, 'l-new'])),
    ).toBeNull();
  });

  it('follows the snapshot order, whatever order the eligible set was built in', () => {
    const shuffled = new Set(['l5', 'l1', 'l3']);
    expect(eligibleSequence(content, shuffled).map((l) => l.lessonId)).toEqual([
      'l1',
      'l3',
      'l5',
    ]);
    expect(listedLessonIds(content)).toEqual(['l1', 'l2', 'l3', 'l4', 'l5']);
  });

  it('never leaks across levels: a snapshot of one level carries only that level', () => {
    expect(content.level).toBe('BEGINNER');
    expect(toCourseView(content, 1, all)!.level).toBe('BEGINNER');
  });
});

describe('a malformed stored snapshot', () => {
  const broken = { level: 'BEGINNER', course: { id: 'c' } } as never;

  it('lists nothing instead of failing', () => {
    expect(listedLessonIds(broken)).toEqual([]);
    expect(toCourseView(broken, 1, new Set(['x']))).toBeNull();
    expect(navigationFor(broken, 1, 'x', new Set(['x']))).toBeNull();
  });
});

describe('preserveOrder', () => {
  it('returns the live order when nothing was published before', () => {
    expect(preserveOrder(['a', 'b', 'c'], [])).toEqual(['a', 'b', 'c']);
  });

  it('keeps the published relative order of the ids that remain', () => {
    expect(preserveOrder(['c', 'b', 'a'], ['a', 'b', 'c'])).toEqual([
      'a',
      'b',
      'c',
    ]);
  });

  it('drops ids that are no longer live and inserts new ones before their closest placed successor, else last', () => {
    expect(preserveOrder(['a', 'n', 'c'], ['a', 'gone', 'c'])).toEqual([
      'a',
      'n',
      'c',
    ]);
    expect(preserveOrder(['n', 'a', 'c'], ['a', 'c'])).toEqual(['n', 'a', 'c']);
    expect(preserveOrder(['a', 'c', 'n', 'm'], ['a', 'c'])).toEqual([
      'a',
      'c',
      'n',
      'm',
    ]);
  });
});

describe('planCatalogTransition', () => {
  it('allows PUBLISH of a listed PUBLISHED subject (a refresh) and nothing else new', () => {
    expect(planCatalogTransition('PUBLISH', 'PUBLISHED', true)).toEqual({
      allowed: true,
      from: 'PUBLISHED',
      to: 'PUBLISHED',
    });
    expect(planCatalogTransition('PUBLISH', 'PUBLISHED', false).allowed).toBe(
      false,
    );
    expect(planCatalogTransition('PUBLISH', 'DRAFT', true).allowed).toBe(false);
    expect(planCatalogTransition('PUBLISH', 'APPROVED', true)).toMatchObject({
      allowed: true,
      to: 'PUBLISHED',
    });
    expect(planCatalogTransition('UNPUBLISH', 'PUBLISHED', true)).toMatchObject(
      { to: 'APPROVED' },
    );
  });
});

describe('buildCatalogLevels keeps the published lesson order', () => {
  const summary = {
    title: 't',
    shortTitle: null,
    subtitle: null,
    estimatedMinutes: null,
  };
  const build = (
    live: string[],
    previousOrder: string[] | null,
    approved: boolean,
  ) => {
    const summaries = new Map(
      live.map((id) => [id, new Map([['BEGINNER' as const, summary]])]),
    );
    const previous = previousOrder
      ? new Map([
          [
            'BEGINNER' as const,
            {
              schemaVersion: 1,
              level: 'BEGINNER' as const,
              course: { id: 'c', title: 'c', description: null },
              modules: [
                {
                  id: 'm',
                  title: 'm',
                  description: null,
                  lessons: previousOrder.map((id) => ({ id, ...summary })),
                },
              ],
            },
          ],
        ])
      : undefined;
    return buildCatalogLevels({
      course: { id: 'c', title: 'c', description: null },
      modules: [{ moduleId: 'm', position: 1, title: 'm', description: null }],
      placements: live.map((lessonId) => ({ lessonId, moduleId: 'm' })),
      summaries,
      previous,
      liveLessonOrder: approved ? new Set(['m']) : new Set(),
    })
      .get('BEGINNER')!
      .modules[0].lessons.map((l) => l.id);
  };

  it('keeps the previous order unless the live order is approved', () => {
    expect(build(['b', 'a', 'c'], ['a', 'b'], false)).toEqual(['a', 'b', 'c']);
    expect(build(['b', 'a', 'c'], ['a', 'b'], true)).toEqual(['b', 'a', 'c']);
    expect(build(['b', 'a'], null, false)).toEqual(['b', 'a']);
  });
});
