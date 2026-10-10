import { randomUUID } from 'node:crypto';
import type { EntityManager } from 'typeorm';
import type { TransactionRunner } from '../../../database/transaction-runner.js';
import {
  BusinessRuleError,
  ConflictError,
  NotFoundError,
} from '../../../shared-kernel/index.js';
import { MAX_BLOCKS_PER_LESSON } from '../domain/blocks/block-content.js';
import type { BlockType } from '../domain/blocks/block-types.js';
import { BlockTypeRegistry } from '../domain/blocks/registry.js';
import type { LessonBlock } from '../domain/models.js';
import type { LessonBlockRepository } from '../persistence/lesson-block.repository.js';
import type { LessonRepository } from '../persistence/lesson.repository.js';
import { BlockService } from './block.service.js';

// In-memory stand-ins. The real SQL is covered by the integration tests.
class FakeLessons {
  known = new Set<string>();
  locked: string[] = [];
  drafted: string[] = [];
  async findById(id: string) {
    return this.known.has(id) ? { id } : null;
  }
  async findByIdForUpdate(id: string) {
    if (!this.known.has(id)) return null;
    this.locked.push(id);
    return { id };
  }
  async markDraft(id: string) {
    this.drafted.push(id);
  }
}

class FakeBlocks {
  rows = new Map<string, LessonBlock>();
  async insert(input: {
    lessonId: string;
    type: BlockType;
    sharedContent: Record<string, unknown> | null;
    position: number;
  }) {
    const taken = [...this.rows.values()].some(
      (b) => b.lessonId === input.lessonId && b.position === input.position,
    );
    if (taken)
      throw new ConflictError('Another block already has this position');
    const now = new Date();
    const block: LessonBlock = {
      id: randomUUID(),
      ...input,
      version: 1,
      createdAt: now,
      updatedAt: now,
    };
    this.rows.set(block.id, block);
    return { ...block };
  }
  async findById(id: string) {
    const row = this.rows.get(id);
    return row ? { ...row } : null;
  }
  findByIdForUpdate(id: string) {
    return this.findById(id);
  }
  async listByLesson(lessonId: string) {
    return [...this.rows.values()]
      .filter((b) => b.lessonId === lessonId)
      .sort((a, b) => a.position - b.position)
      .map((b) => ({ ...b }));
  }
  async countByLesson(lessonId: string) {
    return (await this.listByLesson(lessonId)).length;
  }
  async updateContent(
    id: string,
    sharedContent: Record<string, unknown> | null,
  ) {
    const row = this.rows.get(id)!;
    Object.assign(row, { sharedContent, version: row.version + 1 });
    return { ...row };
  }
  async delete(id: string) {
    this.rows.delete(id);
  }
  async shiftFrom(lessonId: string, from: number, delta: number) {
    for (const b of this.rows.values()) {
      if (b.lessonId === lessonId && b.position >= from) b.position += delta;
    }
  }
  async applyPositions(lessonId: string, ids: string[], positions: number[]) {
    ids.forEach((id, i) => {
      const b = this.rows.get(id);
      if (b && b.lessonId === lessonId) b.position = positions[i];
    });
  }
  /** (position, label) pairs, where the label is the first text of the block. */
  layout(lessonId: string) {
    return [...this.rows.values()]
      .filter((b) => b.lessonId === lessonId)
      .sort((a, b) => a.position - b.position)
      .map((b) => [b.position, label(b)] as const);
  }
}

const rich = (value: string) => ({
  body: {
    type: 'doc',
    content: [{ type: 'paragraph', content: [{ type: 'text', text: value }] }],
  },
});
const label = (block: LessonBlock): string | null =>
  (block.sharedContent as ReturnType<typeof rich> | null)?.body.content[0]
    .content[0].text ?? null;

function build() {
  const lessons = new FakeLessons();
  const blocks = new FakeBlocks();
  const transactions = {
    run: (work: (m: EntityManager) => unknown) => work({} as EntityManager),
  } as unknown as TransactionRunner;
  const service = new BlockService(
    lessons as unknown as LessonRepository,
    blocks as unknown as LessonBlockRepository,
    new BlockTypeRegistry(),
    transactions,
  );
  const lessonId = randomUUID();
  lessons.known.add(lessonId);
  return { lessons, blocks, service, lessonId };
}

async function lessonWith(values: string[]) {
  const ctx = build();
  for (const value of values) {
    await ctx.service.create(ctx.lessonId, {
      type: 'RICH_TEXT',
      sharedContent: rich(value),
    });
  }
  return ctx;
}

describe('create', () => {
  it('creates a RICH_TEXT block with a stable id, its type and version 1', async () => {
    const { service, lessonId } = build();
    const block = await service.create(lessonId, {
      type: 'RICH_TEXT',
      sharedContent: rich('Hello'),
    });
    expect(block).toMatchObject({
      lessonId,
      type: 'RICH_TEXT',
      position: 1,
      sharedContent: rich('Hello'),
      version: 1,
    });
    expect(block.id).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('allows a draft block with no content yet', async () => {
    const { service, lessonId } = build();
    expect(
      (await service.create(lessonId, { type: 'RICH_TEXT' })).sharedContent,
    ).toBeNull();
    expect(
      (
        await service.create(lessonId, {
          type: 'RICH_TEXT',
          sharedContent: null,
        })
      ).sharedContent,
    ).toBeNull();
  });

  it('rejects types that exist in the guide but are not implemented, without writing', async () => {
    const { service, blocks, lessonId } = build();
    for (const type of [
      'QUIZ',
      'IMAGE',
      'SCRIPTURE_PASSAGE',
      'CALLOUT',
    ] as BlockType[]) {
      await expect(service.create(lessonId, { type })).rejects.toBeInstanceOf(
        BusinessRuleError,
      );
    }
    expect(blocks.rows.size).toBe(0);
  });

  it('rejects invalid content with the problems, without writing or touching the lesson', async () => {
    const { service, blocks, lessons, lessonId } = build();
    const error = await service
      .create(lessonId, {
        type: 'RICH_TEXT',
        sharedContent: { html: '<p>x</p>' },
      })
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(BusinessRuleError);
    expect((error as BusinessRuleError).details).toHaveProperty('problems');
    expect(blocks.rows.size).toBe(0);
    expect(lessons.drafted).toEqual([]);
  });

  it('appends in order starting at 1, locks the lesson, and puts it back to DRAFT', async () => {
    const { blocks, lessons, lessonId } = await lessonWith(['a', 'b', 'c']);
    expect(blocks.layout(lessonId)).toEqual([
      [1, 'a'],
      [2, 'b'],
      [3, 'c'],
    ]);
    expect(lessons.locked).toHaveLength(3);
    expect(lessons.drafted).toHaveLength(3);
  });

  it('inserts at a position and pushes later blocks down', async () => {
    const { service, blocks, lessonId } = await lessonWith(['a', 'b', 'c']);
    await service.create(lessonId, {
      type: 'RICH_TEXT',
      sharedContent: rich('x'),
      position: 2,
    });
    await service.create(lessonId, {
      type: 'RICH_TEXT',
      sharedContent: rich('first'),
      position: 1,
    });
    expect(blocks.layout(lessonId)).toEqual([
      [1, 'first'],
      [2, 'a'],
      [3, 'x'],
      [4, 'b'],
      [5, 'c'],
    ]);
  });

  it('rejects a position past the end and writes nothing', async () => {
    const { service, blocks, lessonId } = await lessonWith(['a', 'b']);
    await expect(
      service.create(lessonId, { type: 'RICH_TEXT', position: 4 }),
    ).rejects.toBeInstanceOf(BusinessRuleError);
    expect(blocks.layout(lessonId)).toEqual([
      [1, 'a'],
      [2, 'b'],
    ]);
  });

  it('requires an existing lesson', async () => {
    const { service } = build();
    await expect(
      service.create(randomUUID(), { type: 'RICH_TEXT' }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it('stops at the per-lesson limit', async () => {
    const { service, blocks, lessonId } = build();
    for (let position = 1; position <= MAX_BLOCKS_PER_LESSON; position += 1) {
      blocks.rows.set(randomUUID(), {
        id: randomUUID(),
        lessonId,
        type: 'RICH_TEXT',
        position,
        sharedContent: null,
        version: 1,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
    }
    await expect(
      service.create(lessonId, { type: 'RICH_TEXT' }),
    ).rejects.toBeInstanceOf(BusinessRuleError);
  });

  it('keeps lessons independent', async () => {
    const { service, blocks, lessons, lessonId } = await lessonWith(['a']);
    const other = randomUUID();
    lessons.known.add(other);
    await service.create(other, {
      type: 'RICH_TEXT',
      sharedContent: rich('z'),
    });
    expect(blocks.layout(lessonId)).toEqual([[1, 'a']]);
    expect(blocks.layout(other)).toEqual([[1, 'z']]);
  });
});

describe('read', () => {
  it('lists in position order and gets one block', async () => {
    const { service, lessonId } = await lessonWith(['a', 'b']);
    const items = await service.list(lessonId);
    expect(items.map(label)).toEqual(['a', 'b']);
    expect(label(await service.get(lessonId, items[1].id))).toBe('b');
  });

  it('reports unknown lessons and blocks as NotFoundError', async () => {
    const { service, lessonId } = await lessonWith(['a']);
    await expect(service.list(randomUUID())).rejects.toBeInstanceOf(
      NotFoundError,
    );
    await expect(service.get(lessonId, randomUUID())).rejects.toBeInstanceOf(
      NotFoundError,
    );
  });

  it('cannot reach a block through another lesson', async () => {
    const { service, lessons, lessonId } = await lessonWith(['a']);
    const other = randomUUID();
    lessons.known.add(other);
    const [block] = await service.list(lessonId);
    await expect(service.get(other, block.id)).rejects.toBeInstanceOf(
      NotFoundError,
    );
    await expect(
      service.update(other, block.id, { sharedContent: null }),
    ).rejects.toBeInstanceOf(NotFoundError);
    await expect(service.duplicate(other, block.id)).rejects.toBeInstanceOf(
      NotFoundError,
    );
    await expect(service.delete(other, block.id)).rejects.toBeInstanceOf(
      NotFoundError,
    );
  });
});

describe('update', () => {
  it('replaces the content, bumps the version, keeps type and position', async () => {
    const { service, lessonId } = await lessonWith(['a', 'b']);
    const [, b] = await service.list(lessonId);
    const updated = await service.update(lessonId, b.id, {
      sharedContent: rich('b2'),
    });
    expect(updated).toMatchObject({
      id: b.id,
      type: 'RICH_TEXT',
      position: 2,
      version: 2,
    });
    expect(label(updated)).toBe('b2');
  });

  it('clears the content with null', async () => {
    const { service, lessonId } = await lessonWith(['a']);
    const [a] = await service.list(lessonId);
    expect(
      (await service.update(lessonId, a.id, { sharedContent: null }))
        .sharedContent,
    ).toBeNull();
  });

  it('rejects an update with nothing to change, and invalid content, and changes nothing', async () => {
    const { service, blocks, lessonId } = await lessonWith(['a']);
    const [a] = await service.list(lessonId);
    await expect(service.update(lessonId, a.id, {})).rejects.toBeInstanceOf(
      BusinessRuleError,
    );
    await expect(
      service.update(lessonId, a.id, {
        sharedContent: { body: { type: 'doc', content: [{ type: 'image' }] } },
      }),
    ).rejects.toBeInstanceOf(BusinessRuleError);
    expect(blocks.layout(lessonId)).toEqual([[1, 'a']]);
    expect(blocks.rows.get(a.id)!.version).toBe(1);
  });

  it('refuses a stale edit with a conflict', async () => {
    const { service, lessonId } = await lessonWith(['a']);
    const [a] = await service.list(lessonId);
    await service.update(lessonId, a.id, { sharedContent: rich('a2') });
    await expect(
      service.update(lessonId, a.id, { sharedContent: rich('a3'), version: 1 }),
    ).rejects.toBeInstanceOf(ConflictError);
    await expect(
      service.update(lessonId, a.id, { sharedContent: rich('a3'), version: 2 }),
    ).resolves.toMatchObject({ version: 3 });
  });

  it('puts the lesson back to DRAFT', async () => {
    const { service, lessons, lessonId } = await lessonWith(['a']);
    const [a] = await service.list(lessonId);
    lessons.drafted.length = 0;
    await service.update(lessonId, a.id, { sharedContent: rich('a2') });
    expect(lessons.drafted).toEqual([lessonId]);
  });

  it('locks the lesson before reading the block', async () => {
    const { service, lessons, lessonId } = await lessonWith(['a']);
    const [a] = await service.list(lessonId);
    lessons.locked.length = 0;
    await service.update(lessonId, a.id, { sharedContent: rich('a2') });
    expect(lessons.locked).toEqual([lessonId]);
  });
});

describe('duplicate', () => {
  it('copies the block to just after the original, with a new id, the same type and content', async () => {
    const { service, blocks, lessonId } = await lessonWith(['a', 'b', 'c']);
    const [a] = await service.list(lessonId);

    const copy = await service.duplicate(lessonId, a.id);
    expect(copy.id).not.toBe(a.id);
    expect(copy).toMatchObject({ type: 'RICH_TEXT', position: 2, version: 1 });
    expect(copy.sharedContent).toEqual(a.sharedContent);
    expect(blocks.layout(lessonId)).toEqual([
      [1, 'a'],
      [2, 'a'],
      [3, 'b'],
      [4, 'c'],
    ]);
  });

  it('makes an independent copy: later edits to one never change the other', async () => {
    const { service, lessonId } = await lessonWith(['a']);
    const [a] = await service.list(lessonId);
    const copy = await service.duplicate(lessonId, a.id);

    await service.update(lessonId, copy.id, { sharedContent: rich('changed') });
    expect(label(await service.get(lessonId, a.id))).toBe('a');
    expect(label(await service.get(lessonId, copy.id))).toBe('changed');
  });

  it('does not share object references with the original', async () => {
    const { service, blocks, lessonId } = await lessonWith(['a']);
    const [a] = await service.list(lessonId);
    const copy = await service.duplicate(lessonId, a.id);
    expect(blocks.rows.get(copy.id)!.sharedContent).not.toBe(
      blocks.rows.get(a.id)!.sharedContent,
    );
  });

  it('duplicates a block that has no content yet', async () => {
    const { service, lessonId } = build();
    await service.create(lessonId, { type: 'RICH_TEXT' });
    const [empty] = await service.list(lessonId);
    expect(
      (await service.duplicate(lessonId, empty.id)).sharedContent,
    ).toBeNull();
  });

  it('appends after the last block when duplicating the last block', async () => {
    const { service, blocks, lessonId } = await lessonWith(['a', 'b']);
    const [, b] = await service.list(lessonId);
    await service.duplicate(lessonId, b.id);
    expect(blocks.layout(lessonId)).toEqual([
      [1, 'a'],
      [2, 'b'],
      [3, 'b'],
    ]);
  });

  it('puts the lesson back to DRAFT and respects the per-lesson limit', async () => {
    const { service, lessons, blocks, lessonId } = await lessonWith(['a']);
    const [a] = await service.list(lessonId);
    lessons.drafted.length = 0;
    await service.duplicate(lessonId, a.id);
    expect(lessons.drafted).toEqual([lessonId]);

    for (let position = 3; position <= MAX_BLOCKS_PER_LESSON; position += 1) {
      blocks.rows.set(randomUUID(), {
        ...blocks.rows.get(a.id)!,
        id: randomUUID(),
        position,
      });
    }
    await expect(service.duplicate(lessonId, a.id)).rejects.toBeInstanceOf(
      BusinessRuleError,
    );
  });
});

describe('delete', () => {
  it('removes the block and closes the gap', async () => {
    const { service, blocks, lessonId } = await lessonWith(['a', 'b', 'c']);
    const [, b] = await service.list(lessonId);
    await service.delete(lessonId, b.id);
    expect(blocks.layout(lessonId)).toEqual([
      [1, 'a'],
      [2, 'c'],
    ]);
  });

  it('puts the lesson back to DRAFT and reports unknown blocks', async () => {
    const { service, lessons, lessonId } = await lessonWith(['a']);
    const [a] = await service.list(lessonId);
    lessons.drafted.length = 0;
    await service.delete(lessonId, a.id);
    expect(lessons.drafted).toEqual([lessonId]);
    await expect(service.delete(lessonId, a.id)).rejects.toBeInstanceOf(
      NotFoundError,
    );
  });
});

describe('reorder', () => {
  it('applies the order deterministically', async () => {
    const { service, blocks, lessonId } = await lessonWith(['a', 'b', 'c']);
    const [a, b, c] = await service.list(lessonId);
    const result = await service.reorder(lessonId, [c.id, a.id, b.id]);
    expect(result.map((x) => [x.position, label(x)])).toEqual([
      [1, 'c'],
      [2, 'a'],
      [3, 'b'],
    ]);
    const again = await service.reorder(lessonId, [c.id, a.id, b.id]);
    expect(again.map(label)).toEqual(['c', 'a', 'b']);
    expect(blocks.layout(lessonId)).toEqual([
      [1, 'c'],
      [2, 'a'],
      [3, 'b'],
    ]);
  });

  it('keeps block ids stable', async () => {
    const { service, lessonId } = await lessonWith(['a', 'b']);
    const [a, b] = await service.list(lessonId);
    const result = await service.reorder(lessonId, [b.id, a.id]);
    expect(result.map((x) => x.id)).toEqual([b.id, a.id]);
  });

  it('rejects incomplete, duplicated and foreign orders and changes nothing', async () => {
    const { service, blocks, lessons, lessonId } = await lessonWith(['a', 'b']);
    const [a, b] = await service.list(lessonId);
    const other = randomUUID();
    lessons.known.add(other);
    const foreign = await service.create(other, {
      type: 'RICH_TEXT',
      sharedContent: rich('f'),
    });

    for (const ids of [
      [a.id],
      [a.id, a.id],
      [a.id, b.id, foreign.id],
      [b.id, foreign.id],
    ]) {
      await expect(service.reorder(lessonId, ids)).rejects.toBeInstanceOf(
        BusinessRuleError,
      );
    }
    expect(blocks.layout(lessonId)).toEqual([
      [1, 'a'],
      [2, 'b'],
    ]);
  });

  it('accepts an empty order for a lesson without blocks and requires the lesson to exist', async () => {
    const { service, lessonId } = build();
    expect(await service.reorder(lessonId, [])).toEqual([]);
    await expect(service.reorder(randomUUID(), [])).rejects.toBeInstanceOf(
      NotFoundError,
    );
  });
});
