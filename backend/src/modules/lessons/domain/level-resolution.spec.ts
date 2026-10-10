import {
  LEARNING_LEVELS,
  type LearningLevel,
} from '../../../shared-kernel/index.js';
import type { VariantSupport } from './blocks/registry.js';
import {
  type Content,
  type ResolvableBlock,
  type ResolvableLesson,
  resolveLesson,
} from './level-resolution.js';

const ALL = [...LEARNING_LEVELS];
const text = (value: string): Content => ({ t: value });

function block(
  id: string,
  position: number,
  options: {
    shared?: Content | null;
    levels?: Partial<Record<LearningLevel, Content | null>>;
    variants?: VariantSupport;
  } = {},
): ResolvableBlock {
  return {
    id,
    type: 'RICH_TEXT',
    position,
    sharedContent: options.shared ?? null,
    variantSupport: options.variants ?? 'SUPPORTED',
    levels: LEARNING_LEVELS.filter(
      (level) => level in (options.levels ?? {}),
    ).map((level) => ({ level, variant: options.levels![level] ?? null })),
  };
}

const lesson = (
  blocks: ResolvableBlock[],
  availableLevels: LearningLevel[] = ALL,
): ResolvableLesson => ({
  availableLevels,
  blocks,
});

describe('availability', () => {
  it('a lesson that is not available at the level resolves to nothing, with one diagnostic', () => {
    const result = resolveLesson(
      lesson(
        [block('b', 1, { shared: text('x'), levels: { BEGINNER: null } })],
        ['BEGINNER'],
      ),
      'ADVANCED',
    );
    expect(result).toMatchObject({
      level: 'ADVANCED',
      available: false,
      blocks: [],
      diagnostics: [{ code: 'LESSON_NOT_AVAILABLE_AT_LEVEL' }],
    });
  });

  it('a lesson with no levels at all is not available anywhere', () => {
    for (const level of ALL) {
      expect(resolveLesson(lesson([], []), level).available).toBe(false);
    }
  });
});

describe('visibility', () => {
  it('a block without a row for the level is hidden: skipped, with no diagnostic', () => {
    const result = resolveLesson(
      lesson([
        block('shown', 1, { shared: text('a'), levels: { BEGINNER: null } }),
        block('hidden', 2, { shared: text('b'), levels: { ADVANCED: null } }),
      ]),
      'BEGINNER',
    );
    expect(result.blocks.map((b) => b.blockId)).toEqual(['shown']);
    expect(result.diagnostics).toEqual([]);
  });

  it('a block with no rows at all is hidden everywhere', () => {
    for (const level of ALL) {
      const result = resolveLesson(
        lesson([block('b', 1, { shared: text('x') })]),
        level,
      );
      expect(result.blocks).toEqual([]);
    }
  });

  it('numbers only the visible blocks, in position order, whatever the input order', () => {
    const blocks = [
      block('c', 3, { shared: text('c'), levels: { BEGINNER: null } }),
      block('x', 2, { shared: text('x'), levels: { ADVANCED: null } }),
      block('a', 1, { shared: text('a'), levels: { BEGINNER: null } }),
    ];
    const result = resolveLesson(lesson(blocks), 'BEGINNER');
    expect(result.blocks.map((b) => [b.blockId, b.ordinal])).toEqual([
      ['a', 1],
      ['c', 2],
    ]);
  });
});

describe('content: variant, then shared, never anything else', () => {
  it('uses the variant for the requested level when there is one', () => {
    const result = resolveLesson(
      lesson([
        block('b', 1, {
          shared: text('shared'),
          levels: { BEGINNER: text('beginner variant') },
        }),
      ]),
      'BEGINNER',
    );
    expect(result.blocks[0]).toMatchObject({
      source: 'VARIANT',
      content: text('beginner variant'),
    });
  });

  it("uses the block's own shared content when the level has no variant", () => {
    const result = resolveLesson(
      lesson([
        block('b', 1, {
          shared: text('shared'),
          levels: { INTERMEDIATE: null },
        }),
      ]),
      'INTERMEDIATE',
    );
    expect(result.blocks[0]).toMatchObject({
      source: 'SHARED',
      content: text('shared'),
    });
  });

  it('a variant wins over shared content', () => {
    const result = resolveLesson(
      lesson([
        block('b', 1, {
          shared: text('shared'),
          levels: { ADVANCED: text('adv') },
        }),
      ]),
      'ADVANCED',
    );
    expect(result.blocks[0].content).toEqual(text('adv'));
  });

  it('is unresolved, never silently skipped, when there is neither variant nor shared content', () => {
    const result = resolveLesson(
      lesson([block('b', 1, { levels: { INTERMEDIATE: null } })]),
      'INTERMEDIATE',
    );
    expect(result.blocks).toEqual([
      {
        blockId: 'b',
        type: 'RICH_TEXT',
        ordinal: 1,
        source: null,
        content: null,
        unresolved: { code: 'BLOCK_NO_CONTENT', message: expect.any(String) },
      },
    ]);
    expect(result.diagnostics).toEqual([
      { code: 'BLOCK_NO_CONTENT', blockId: 'b', message: expect.any(String) },
    ]);
  });

  it('a variant stored for a type that does not support variants is a diagnostic, not a fallback', () => {
    for (const variants of ['UNCONFIRMED', 'NOT_SUPPORTED'] as const) {
      const result = resolveLesson(
        lesson([
          block('b', 1, {
            shared: text('shared'),
            variants,
            levels: { BEGINNER: text('stored') },
          }),
        ]),
        'BEGINNER',
      );
      expect(result.blocks[0]).toMatchObject({
        source: null,
        content: null,
        unresolved: { code: 'BLOCK_VARIANT_NOT_ALLOWED' },
      });
      expect(JSON.stringify(result)).not.toContain('shared"'); // not even the shared content leaks in
    }
  });

  it('visibility alone is fine for types without variant support', () => {
    const result = resolveLesson(
      lesson([
        block('b', 1, {
          shared: text('s'),
          variants: 'UNCONFIRMED',
          levels: { BEGINNER: null },
        }),
      ]),
      'BEGINNER',
    );
    expect(result.blocks[0]).toMatchObject({ source: 'SHARED' });
  });
});

describe('no fallback between levels (explicit cases)', () => {
  const beginnerAndAdvanced = block('b', 1, {
    levels: {
      BEGINNER: text('BEGINNER-ONLY'),
      INTERMEDIATE: null,
      ADVANCED: text('ADVANCED-ONLY'),
    },
  });

  it('INTERMEDIATE never receives the BEGINNER or ADVANCED variant', () => {
    const result = resolveLesson(lesson([beginnerAndAdvanced]), 'INTERMEDIATE');
    expect(result.blocks[0].unresolved?.code).toBe('BLOCK_NO_CONTENT');
    const json = JSON.stringify(result);
    expect(json).not.toContain('BEGINNER-ONLY');
    expect(json).not.toContain('ADVANCED-ONLY');
  });

  it('ADVANCED never receives the INTERMEDIATE variant, and BEGINNER never receives ADVANCED', () => {
    const onlyIntermediate = block('b', 1, {
      levels: {
        INTERMEDIATE: text('INTERMEDIATE-ONLY'),
        ADVANCED: null,
        BEGINNER: null,
      },
    });
    for (const level of ['ADVANCED', 'BEGINNER'] as const) {
      const result = resolveLesson(lesson([onlyIntermediate]), level);
      expect(result.blocks[0].unresolved?.code).toBe('BLOCK_NO_CONTENT');
      expect(JSON.stringify(result)).not.toContain('INTERMEDIATE-ONLY');
    }
  });

  it("shared content is used instead of another level's variant", () => {
    const result = resolveLesson(
      lesson([
        block('b', 1, {
          shared: text('NEUTRAL'),
          levels: { BEGINNER: text('BEGINNER-ONLY'), ADVANCED: null },
        }),
      ]),
      'ADVANCED',
    );
    expect(result.blocks[0]).toMatchObject({
      source: 'SHARED',
      content: text('NEUTRAL'),
    });
    expect(JSON.stringify(result)).not.toContain('BEGINNER-ONLY');
  });

  it('a level the lesson is not available at never borrows content from the others', () => {
    const result = resolveLesson(
      lesson([beginnerAndAdvanced], ['BEGINNER', 'ADVANCED']),
      'INTERMEDIATE',
    );
    expect(result.available).toBe(false);
    expect(JSON.stringify(result)).not.toContain('ONLY');
  });
});

describe('diagnostics', () => {
  it('NO_VISIBLE_BLOCKS only when the lesson is available and nothing is visible at the level', () => {
    const empty = resolveLesson(lesson([]), 'BEGINNER');
    expect(empty).toMatchObject({
      available: true,
      blocks: [],
      diagnostics: [{ code: 'NO_VISIBLE_BLOCKS' }],
    });

    const hiddenOnly = resolveLesson(
      lesson([
        block('b', 1, { shared: text('x'), levels: { ADVANCED: null } }),
      ]),
      'BEGINNER',
    );
    expect(hiddenOnly.diagnostics.map((d) => d.code)).toEqual([
      'NO_VISIBLE_BLOCKS',
    ]);
  });

  it('visible-but-unresolved blocks report their own diagnostics instead of NO_VISIBLE_BLOCKS', () => {
    const result = resolveLesson(
      lesson([block('b', 1, { levels: { BEGINNER: null } })]),
      'BEGINNER',
    );
    expect(result.diagnostics.map((d) => d.code)).toEqual(['BLOCK_NO_CONTENT']);
  });

  it('a hidden block never produces a diagnostic, even when it has no content at all', () => {
    const result = resolveLesson(
      lesson([
        block('empty-hidden', 1, { levels: { ADVANCED: null } }),
        block('ok', 2, { shared: text('x'), levels: { BEGINNER: null } }),
      ]),
      'BEGINNER',
    );
    expect(result.diagnostics).toEqual([]);
    expect(result.blocks.map((b) => b.blockId)).toEqual(['ok']);
  });

  it('reports every unresolved block, in order, and keeps the resolved ones', () => {
    const result = resolveLesson(
      lesson([
        block('one', 1, { levels: { BEGINNER: null } }),
        block('two', 2, { shared: text('ok'), levels: { BEGINNER: null } }),
        block('three', 3, { levels: { BEGINNER: null } }),
      ]),
      'BEGINNER',
    );
    expect(result.blocks.map((b) => [b.blockId, b.ordinal, b.source])).toEqual([
      ['one', 1, null],
      ['two', 2, 'SHARED'],
      ['three', 3, null],
    ]);
    expect(result.diagnostics.map((d) => d.blockId)).toEqual(['one', 'three']);
  });
});

describe('purity', () => {
  const sample = lesson([
    block('b', 2, {
      shared: text('s'),
      levels: { BEGINNER: text('v'), ADVANCED: null },
    }),
    block('a', 1, { levels: { BEGINNER: null } }),
  ]);

  it('is deterministic, whatever order the blocks arrive in', () => {
    const expected = resolveLesson(sample, 'BEGINNER');
    expect(resolveLesson(sample, 'BEGINNER')).toEqual(expected);
    expect(
      resolveLesson(
        { ...sample, blocks: [...sample.blocks].reverse() },
        'BEGINNER',
      ),
    ).toEqual(expected);
  });

  it('does not modify its input', () => {
    const deepFreeze = <T>(value: T): T => {
      if (typeof value === 'object' && value !== null) {
        Object.values(value).forEach(deepFreeze);
        Object.freeze(value);
      }
      return value;
    };
    const frozen = deepFreeze(structuredClone(sample));
    expect(() => resolveLesson(frozen, 'BEGINNER')).not.toThrow();
    expect(frozen).toEqual(sample);
  });
});

describe("randomized: a level never receives another level's variant", () => {
  // A small deterministic generator, so a failure is reproducible from the seed.
  const generator = (seed: number) => () => {
    seed = (seed * 1664525 + 1013904223) % 4294967296;
    return seed / 4294967296;
  };

  /** Variants carry a sentinel naming their level and block; shared content is neutral and identical everywhere. */
  const sentinel = (level: LearningLevel, blockId: string) =>
    `VARIANT<${level}|${blockId}>`;
  const NEUTRAL = 'NEUTRAL-SHARED-CONTENT';

  it.each(Array.from({ length: 25 }, (_, i) => i + 1))('seed %i', (seed) => {
    const random = generator(seed);
    const pick = <T>(items: readonly T[]) =>
      items[Math.floor(random() * items.length)];

    const available = ALL.filter(() => random() < 0.8);
    const blocks: ResolvableBlock[] = Array.from(
      { length: 1 + Math.floor(random() * 8) },
      (_, index) => {
        const id = `block-${index}`;
        const levels = ALL.filter(() => random() < 0.6).map((level) => ({
          level,
          variant: random() < 0.5 ? { t: sentinel(level, id) } : null,
        }));
        return {
          id,
          type: 'RICH_TEXT' as const,
          position: index + 1,
          sharedContent: random() < 0.5 ? { t: NEUTRAL } : null,
          variantSupport: pick([
            'SUPPORTED',
            'SUPPORTED',
            'UNCONFIRMED',
          ] as const),
          levels,
        };
      },
    );
    const input = lesson(blocks, available);

    for (const requested of ALL) {
      const result = resolveLesson(input, requested);
      const json = JSON.stringify(result);

      // 1. no sentinel of any other level ever appears
      for (const other of ALL.filter((level) => level !== requested)) {
        expect(
          json,
          `${requested} result mentions a ${other} variant`,
        ).not.toContain(`VARIANT<${other}|`);
      }

      // 2. every VARIANT-sourced block carries exactly its own variant of the requested level
      for (const resolved of result.blocks.filter(
        (b) => b.source === 'VARIANT',
      )) {
        expect(resolved.content).toEqual({
          t: sentinel(requested, resolved.blockId),
        });
      }

      // 3. every SHARED-sourced block carries exactly the neutral shared content
      for (const resolved of result.blocks.filter(
        (b) => b.source === 'SHARED',
      )) {
        expect(resolved.content).toEqual({ t: NEUTRAL });
      }

      // 4. an unavailable level yields nothing; otherwise exactly the blocks that have a row for it
      const expectedVisible = available.includes(requested)
        ? blocks
            .filter((b) => b.levels.some((row) => row.level === requested))
            .map((b) => b.id)
        : [];
      expect(result.blocks.map((b) => b.blockId)).toEqual(expectedVisible);
    }
  });
});
