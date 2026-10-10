import { ForbiddenError } from '../../../shared-kernel/index.js';
import type {
  ContentStatus,
  LearningLevel,
} from '../../../shared-kernel/index.js';
import { CONTENT_STATUSES } from '../../../shared-kernel/index.js';
import { Role } from '../../identity/index.js';
import {
  type AssembledLesson,
  type AssembledLevel,
  type BlockProblem,
  resolveLesson,
} from '../../lessons/index.js';
import { evaluateReadiness } from './readiness.js';
import { ACTION_ROLES, READ_ROLES, canPerform } from './roles.js';
import {
  NO_SEPARATION_OF_DUTIES,
  checkSeparationOfDuties,
} from './separation-of-duties.js';
import {
  MAX_LEVEL_SNAPSHOT_BYTES,
  SNAPSHOT_SCHEMA_VERSION,
  buildLevelPayload,
  canonicalJson,
  payloadBytes,
} from './snapshot-payload.js';
import {
  WORKFLOW_ACTIONS,
  type WorkflowAction,
  isWorkflowAction,
  planTransition,
  requiresNote,
} from './workflow.js';

const ALL_LEVELS: LearningLevel[] = ['BEGINNER', 'INTERMEDIATE', 'ADVANCED'];

describe('workflow transitions', () => {
  const expected: Record<
    Exclude<WorkflowAction, 'UNPUBLISH'>,
    { from: ContentStatus; to: ContentStatus }
  > = {
    SUBMIT_FOR_REVIEW: { from: 'DRAFT', to: 'READY_FOR_REVIEW' },
    REQUEST_CHANGES: { from: 'READY_FOR_REVIEW', to: 'DRAFT' },
    APPROVE: { from: 'READY_FOR_REVIEW', to: 'APPROVED' },
    PUBLISH: { from: 'APPROVED', to: 'PUBLISHED' },
  };

  it('has exactly the five approved actions (no archive)', () => {
    expect([...WORKFLOW_ACTIONS]).toEqual([
      'SUBMIT_FOR_REVIEW',
      'REQUEST_CHANGES',
      'APPROVE',
      'PUBLISH',
      'UNPUBLISH',
    ]);
    expect(isWorkflowAction('ARCHIVE')).toBe(false);
    expect(isWorkflowAction('PUBLISH')).toBe(true);
  });

  describe.each(Object.entries(expected))('%s', (action, { from, to }) => {
    it(`moves ${from} to ${to}`, () => {
      expect(planTransition(action as WorkflowAction, from, false)).toEqual({
        allowed: true,
        from,
        to,
      });
    });

    it.each(CONTENT_STATUSES.filter((status) => status !== from))(
      'is refused from %s, naming the status it needs',
      (status) => {
        expect(planTransition(action as WorkflowAction, status, false)).toEqual(
          {
            allowed: false,
            reason: 'WRONG_STATUS',
            allowedFrom: [from],
          },
        );
      },
    );

    it('does not depend on an active publication', () => {
      expect(
        planTransition(action as WorkflowAction, from, true),
      ).toMatchObject({
        allowed: true,
        to,
      });
    });
  });

  describe('UNPUBLISH', () => {
    it('turns a PUBLISHED lesson back into APPROVED', () => {
      expect(planTransition('UNPUBLISH', 'PUBLISHED', true)).toEqual({
        allowed: true,
        from: 'PUBLISHED',
        to: 'APPROVED',
      });
    });

    it('keeps DRAFT when the edited working copy is still a draft, ending only the publication', () => {
      expect(planTransition('UNPUBLISH', 'DRAFT', true)).toEqual({
        allowed: true,
        from: 'DRAFT',
        to: 'DRAFT',
      });
    });

    // Deferred: what to do for an edited working copy that is already in review or approved is
    // decided when the complete 3F-c workflow is reviewed. Until then it is refused.
    it.each(['READY_FOR_REVIEW', 'APPROVED'] as const)(
      'is not allowed yet for a %s working copy that has an active publication',
      (status) => {
        expect(planTransition('UNPUBLISH', status, true)).toEqual({
          allowed: false,
          reason: 'WRONG_STATUS',
          allowedFrom: ['PUBLISHED', 'DRAFT'],
        });
      },
    );

    it('only ever allows PUBLISHED to APPROVED and DRAFT to DRAFT', () => {
      const allowed = CONTENT_STATUSES.flatMap((status) => {
        const plan = planTransition('UNPUBLISH', status, true);
        return plan.allowed ? [`${plan.from}>${plan.to}`] : [];
      });
      expect(allowed).toEqual(['DRAFT>DRAFT', 'PUBLISHED>APPROVED']);
    });

    it.each(CONTENT_STATUSES)(
      'is refused from %s when nothing is published',
      (status) => {
        expect(planTransition('UNPUBLISH', status, false)).toEqual({
          allowed: false,
          reason: 'NOT_PUBLISHED',
          allowedFrom: [],
        });
      },
    );
  });

  it('is exhaustive: every action from every status gives a definite answer', () => {
    for (const action of WORKFLOW_ACTIONS) {
      for (const status of CONTENT_STATUSES) {
        for (const published of [true, false]) {
          const plan = planTransition(action, status, published);
          expect(typeof plan.allowed).toBe('boolean');
          if (plan.allowed) expect(CONTENT_STATUSES).toContain(plan.to);
        }
      }
    }
  });

  it('PUBLISH is only reachable from APPROVED, and nothing but PUBLISH reaches PUBLISHED', () => {
    const reaching = WORKFLOW_ACTIONS.flatMap((action) =>
      CONTENT_STATUSES.flatMap((status) => {
        const plan = planTransition(action, status, true);
        return plan.allowed &&
          plan.to === 'PUBLISHED' &&
          plan.from !== 'PUBLISHED'
          ? [`${action}:${status}`]
          : [];
      }),
    );
    expect(reaching).toEqual(['PUBLISH:APPROVED']);
  });

  it('only requesting changes requires a note', () => {
    expect(WORKFLOW_ACTIONS.filter(requiresNote)).toEqual(['REQUEST_CHANGES']);
  });
});

describe('role matrix', () => {
  const ROLES = [Role.ADMIN, Role.EDITOR, Role.REVIEWER];

  it('is the approved one', () => {
    expect(ACTION_ROLES).toEqual({
      SUBMIT_FOR_REVIEW: ['ADMIN', 'EDITOR'],
      REQUEST_CHANGES: ['ADMIN', 'REVIEWER'],
      APPROVE: ['ADMIN', 'REVIEWER'],
      PUBLISH: ['ADMIN'],
      UNPUBLISH: ['ADMIN'],
    });
  });

  it.each([
    ['SUBMIT_FOR_REVIEW', { ADMIN: true, EDITOR: true, REVIEWER: false }],
    ['REQUEST_CHANGES', { ADMIN: true, EDITOR: false, REVIEWER: true }],
    ['APPROVE', { ADMIN: true, EDITOR: false, REVIEWER: true }],
    ['PUBLISH', { ADMIN: true, EDITOR: false, REVIEWER: false }],
    ['UNPUBLISH', { ADMIN: true, EDITOR: false, REVIEWER: false }],
  ] as const)('%s', (action, allowed) => {
    for (const role of ROLES) {
      expect(canPerform(action, role), `${action} by ${role}`).toBe(
        allowed[role],
      );
    }
  });

  it('all three roles may read workflow information', () => {
    expect([...READ_ROLES].sort((a, b) => a.localeCompare(b))).toEqual([
      'ADMIN',
      'EDITOR',
      'REVIEWER',
    ]);
  });

  it('never lets an editor approve or publish, or a reviewer submit or publish', () => {
    expect(canPerform('APPROVE', Role.EDITOR)).toBe(false);
    expect(canPerform('PUBLISH', Role.EDITOR)).toBe(false);
    expect(canPerform('SUBMIT_FOR_REVIEW', Role.REVIEWER)).toBe(false);
    expect(canPerform('PUBLISH', Role.REVIEWER)).toBe(false);
  });
});

describe('separation of duties', () => {
  const context = (action: WorkflowAction, actorId: string) => ({
    action,
    actorId,
    priorEvents: [{ action: 'SUBMIT_FOR_REVIEW' as const, actorId: 'alice' }],
  });

  it('policy S0 allows the same person to submit, approve and publish', () => {
    for (const action of WORKFLOW_ACTIONS) {
      expect(NO_SEPARATION_OF_DUTIES(context(action, 'alice'))).toBeNull();
      expect(() =>
        checkSeparationOfDuties(
          NO_SEPARATION_OF_DUTIES,
          context(action, 'alice'),
        ),
      ).not.toThrow();
    }
  });

  it('is extensible: a stricter policy can refuse, and the refusal is a 403', () => {
    const approverMustDiffer = (c: ReturnType<typeof context>) =>
      c.action === 'APPROVE' &&
      c.priorEvents.some((e) => e.actorId === c.actorId)
        ? 'The person who submitted a lesson cannot approve it'
        : null;
    expect(() =>
      checkSeparationOfDuties(approverMustDiffer, context('APPROVE', 'alice')),
    ).toThrow(ForbiddenError);
    expect(() =>
      checkSeparationOfDuties(approverMustDiffer, context('APPROVE', 'bob')),
    ).not.toThrow();
  });
});

// ---- readiness ------------------------------------------------------------------------------

const rich = (text: string) => ({
  body: {
    type: 'doc',
    content: [{ type: 'paragraph', content: [{ type: 'text', text }] }],
  },
});

function levelEntry(
  level: LearningLevel,
  blocks: {
    id: string;
    position: number;
    content: Record<string, unknown> | null;
    visible?: boolean;
  }[],
  blockProblems: BlockProblem[] = [],
): AssembledLevel {
  const resolution = resolveLesson(
    {
      availableLevels: [level],
      blocks: blocks.map((block) => ({
        id: block.id,
        type: 'RICH_TEXT' as const,
        position: block.position,
        sharedContent: block.content,
        variantSupport: 'UNCONFIRMED' as const,
        levels: block.visible === false ? [] : [{ level, variant: null }],
      })),
    },
    level,
  );
  return { level, resolution, blockProblems };
}

function assembled(overrides: Partial<AssembledLesson> = {}): AssembledLesson {
  const base: AssembledLesson = {
    lessonId: 'lesson-1',
    moduleId: 'module-1',
    status: 'APPROVED',
    contentRevision: 4,
    lesson: {
      id: 'lesson-1',
      moduleId: 'module-1',
      title: 'A lesson',
      shortTitle: null,
      subtitle: null,
      introduction: null,
      estimatedMinutes: null,
      coverMediaId: null,
    },
    availableLevels: ALL_LEVELS,
    levels: ALL_LEVELS.map((level) =>
      levelEntry(level, [
        { id: `b-${level}`, position: 1, content: rich(`text ${level}`) },
      ]),
    ),
  };
  return { ...base, ...overrides };
}

describe('readiness', () => {
  it('a complete lesson at three levels is ready, and the report says what it checked', () => {
    const report = evaluateReadiness(assembled());
    expect(report).toEqual({
      lessonId: 'lesson-1',
      ready: true,
      contentRevision: 4,
      issues: [],
      levels: ALL_LEVELS.map((level) => ({
        level,
        visibleBlocks: 1,
        resolvedBlocks: 1,
      })),
    });
  });

  it('title is the only mandatory metadata: everything else may be empty', () => {
    const report = evaluateReadiness(assembled());
    expect(report.ready).toBe(true);
    const blankTitle = evaluateReadiness(
      assembled({ lesson: { ...assembled().lesson, title: '   ' } }),
    );
    expect(blankTitle.issues.map((i) => i.code)).toEqual([
      'LESSON_TITLE_MISSING',
    ]);
    expect(blankTitle.issues[0].source).toBe('RULE');
  });

  it('a lesson with no levels is not ready', () => {
    const report = evaluateReadiness(
      assembled({ availableLevels: [], levels: [] }),
    );
    expect(report.ready).toBe(false);
    expect(report.issues).toEqual([
      expect.objectContaining({
        code: 'LESSON_HAS_NO_LEVELS',
        source: 'RULE',
        severity: 'BLOCKING',
      }),
    ]);
  });

  it('every resolver diagnostic blocks publication, with its level and block', () => {
    const report = evaluateReadiness(
      assembled({
        availableLevels: ['BEGINNER', 'ADVANCED'],
        levels: [
          levelEntry('BEGINNER', [{ id: 'empty', position: 1, content: null }]), // visible, no content
          levelEntry('ADVANCED', [
            { id: 'hidden', position: 1, content: rich('x'), visible: false },
          ]), // nothing visible
        ],
      }),
    );
    expect(report.ready).toBe(false);
    expect(
      report.issues.map((i) => [i.code, i.level, i.blockId, i.source]),
    ).toEqual([
      ['BLOCK_NO_CONTENT', 'BEGINNER', 'empty', 'RESOLVER'],
      ['NO_VISIBLE_BLOCKS', 'ADVANCED', undefined, 'RESOLVER'],
    ]);
  });

  it('reports block content problems, telling product rules from safeguards', () => {
    const problems = [
      { path: 'body', message: 'Rich text must contain some text' },
    ];
    const report = evaluateReadiness(
      assembled({
        levels: [
          levelEntry(
            'BEGINNER',
            [{ id: 'a', position: 1, content: rich('x') }],
            [{ blockId: 'a', code: 'BLOCK_CONTENT_INCOMPLETE', problems }],
          ),
          levelEntry(
            'INTERMEDIATE',
            [{ id: 'b', position: 1, content: rich('x') }],
            [
              { blockId: 'b', code: 'BLOCK_CONTENT_INVALID', problems },
              { blockId: 'c', code: 'BLOCK_TYPE_NOT_AVAILABLE', problems },
            ],
          ),
          levelEntry('ADVANCED', [
            { id: 'd', position: 1, content: rich('x') },
          ]),
        ],
      }),
    );
    expect(report.issues.map((i) => [i.code, i.source, i.level])).toEqual([
      ['BLOCK_CONTENT_INCOMPLETE', 'RULE', 'BEGINNER'],
      ['BLOCK_CONTENT_INVALID', 'SAFEGUARD', 'INTERMEDIATE'],
      ['BLOCK_TYPE_NOT_AVAILABLE', 'SAFEGUARD', 'INTERMEDIATE'],
    ]);
    expect(report.issues[0].problems).toEqual(problems);
  });

  it('caps the problems listed per issue', () => {
    const many = Array.from({ length: 30 }, (_, i) => ({
      path: `p${i}`,
      message: 'm',
    }));
    const report = evaluateReadiness(
      assembled({
        levels: [
          levelEntry(
            'BEGINNER',
            [{ id: 'a', position: 1, content: rich('x') }],
            [{ blockId: 'a', code: 'BLOCK_CONTENT_INVALID', problems: many }],
          ),
          levelEntry('INTERMEDIATE', [
            { id: 'b', position: 1, content: rich('x') },
          ]),
          levelEntry('ADVANCED', [
            { id: 'c', position: 1, content: rich('x') },
          ]),
        ],
      }),
    );
    expect(report.issues[0].problems).toHaveLength(5);
  });

  it('a cover is refused until the Media module exists', () => {
    const report = evaluateReadiness(
      assembled({ lesson: { ...assembled().lesson, coverMediaId: 'media-1' } }),
    );
    expect(report.issues.map((i) => [i.code, i.source])).toEqual([
      ['COVER_NOT_SUPPORTED', 'SAFEGUARD'],
    ]);
  });

  it('reports everything at once, in a deterministic order, not just the first problem', () => {
    const input = assembled({
      lesson: { ...assembled().lesson, title: '', coverMediaId: 'media-1' },
      availableLevels: ['BEGINNER', 'ADVANCED'],
      levels: [
        levelEntry('BEGINNER', [{ id: 'one', position: 1, content: null }]),
        levelEntry('ADVANCED', []),
      ],
    });
    const codes = evaluateReadiness(input).issues.map((i) => i.code);
    expect(codes).toEqual([
      'LESSON_TITLE_MISSING',
      'COVER_NOT_SUPPORTED',
      'BLOCK_NO_CONTENT',
      'NO_VISIBLE_BLOCKS',
    ]);
    expect(evaluateReadiness(input).issues.map((i) => i.code)).toEqual(codes);
  });

  it('every issue is blocking', () => {
    const report = evaluateReadiness(
      assembled({ availableLevels: [], levels: [] }),
    );
    expect(report.issues.every((i) => i.severity === 'BLOCKING')).toBe(true);
  });

  it('blocks a level whose snapshot would exceed 5 MiB of UTF-8, and names the level', () => {
    const huge = rich('x'.repeat(MAX_LEVEL_SNAPSHOT_BYTES + 1));
    const report = evaluateReadiness(
      assembled({
        levels: [
          levelEntry('BEGINNER', [{ id: 'a', position: 1, content: huge }]),
          levelEntry('INTERMEDIATE', [
            { id: 'b', position: 1, content: rich('ok') },
          ]),
          levelEntry('ADVANCED', [
            { id: 'c', position: 1, content: rich('ok') },
          ]),
        ],
      }),
    );
    expect(report.issues).toEqual([
      expect.objectContaining({
        code: 'SNAPSHOT_TOO_LARGE',
        level: 'BEGINNER',
        source: 'SAFEGUARD',
      }),
    ]);
  });
});

// ---- snapshot payload --------------------------------------------------------------------

describe('level snapshot payload', () => {
  it('is self-contained: lesson fields plus the resolved blocks of that level only', () => {
    const input = assembled();
    const level = input.levels[1]; // INTERMEDIATE
    expect(buildLevelPayload(input, level)).toEqual({
      schemaVersion: SNAPSHOT_SCHEMA_VERSION,
      level: 'INTERMEDIATE',
      lesson: input.lesson,
      blocks: [
        {
          blockId: 'b-INTERMEDIATE',
          type: 'RICH_TEXT',
          ordinal: 1,
          source: 'SHARED',
          content: rich('text INTERMEDIATE'),
        },
      ],
    });
  });

  it("never contains another level's content", () => {
    const input = assembled();
    for (const level of input.levels) {
      const text = canonicalJson(buildLevelPayload(input, level));
      for (const other of input.levels.filter((l) => l.level !== level.level)) {
        expect(text).not.toContain(`text ${other.level}`);
      }
    }
  });

  it('leaves unresolved blocks out and keeps block order', () => {
    const input = assembled({
      levels: [
        levelEntry('BEGINNER', [
          { id: 'second', position: 2, content: rich('2') },
          { id: 'empty', position: 3, content: null },
          { id: 'first', position: 1, content: rich('1') },
        ]),
        levelEntry('INTERMEDIATE', []),
        levelEntry('ADVANCED', []),
      ],
    });
    expect(
      buildLevelPayload(input, input.levels[0]).blocks.map((b) => [
        b.blockId,
        b.ordinal,
      ]),
    ).toEqual([
      ['first', 1],
      ['second', 2],
    ]);
  });

  it('does not share the lesson object with the assembled input', () => {
    const input = assembled();
    const payload = buildLevelPayload(input, input.levels[0]);
    payload.lesson.title = 'changed';
    expect(input.lesson.title).toBe('A lesson');
  });

  describe('canonical serialization', () => {
    it('sorts object keys at every depth and keeps array order', () => {
      expect(canonicalJson({ b: 1, a: { d: [3, 1, 2], c: null } })).toBe(
        '{"a":{"c":null,"d":[3,1,2]},"b":1}',
      );
      expect(canonicalJson({ a: 1, b: 2 })).toBe(canonicalJson({ b: 2, a: 1 }));
    });

    it('measures UTF-8 bytes, not characters', () => {
      const payload = buildLevelPayload(
        assembled({ lesson: { ...assembled().lesson, title: 'é✝日本' } }),
        assembled().levels[0],
      );
      expect(payloadBytes(payload)).toBe(
        Buffer.byteLength(canonicalJson(payload), 'utf8'),
      );
      expect(Buffer.byteLength('é✝日本', 'utf8')).toBeGreaterThan(
        'é✝日本'.length,
      );
    });

    it('the size limit is 5 MiB', () => {
      expect(MAX_LEVEL_SNAPSHOT_BYTES).toBe(5 * 1024 * 1024);
    });
  });
});
