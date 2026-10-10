import { randomUUID } from 'node:crypto';
import type { EntityManager } from 'typeorm';
import type { TransactionRunner } from '../../src/database/transaction-runner.js';
import {
  BusinessRuleError,
  ConflictError,
  LEARNING_LEVELS,
  type LearningLevel,
} from '../../src/shared-kernel/index.js';
import type { BlockType } from '../../src/modules/lessons/domain/blocks/block-types.js';
import type {
  BlockLevelSetting,
  LessonBlock,
} from '../../src/modules/lessons/domain/models.js';
import { jsonContentEquals } from '../../src/modules/lessons/domain/json-equality.js';

/**
 * In-memory stand-ins for the lesson repositories, shared by the service unit
 * tests. They mimic the rules the real SQL enforces (unique positions, the
 * composite foreign keys), so the services are tested against realistic
 * behaviour. The real SQL is covered by the integration tests.
 */

export const rich = (value: string) => ({
  body: {
    type: 'doc',
    content: [{ type: 'paragraph', content: [{ type: 'text', text: value }] }],
  },
});

export const label = (block: { sharedContent: unknown }): string | null =>
  (block.sharedContent as ReturnType<typeof rich> | null)?.body.content[0]
    .content[0].text ?? null;

export class FakeLessons {
  known = new Set<string>();
  levelsOf = new Map<string, LearningLevel[]>();
  locked: string[] = [];
  drafted: string[] = [];
  /** content_revision per lesson: moves once for every markDraft. */
  revisions = new Map<string, number>();

  add(id: string, levels: LearningLevel[] = []) {
    this.known.add(id);
    this.levelsOf.set(id, levels);
  }
  private lesson(id: string) {
    return { id, levels: this.levelsOf.get(id) ?? [], version: 1 };
  }
  async findById(id: string) {
    return this.known.has(id) ? this.lesson(id) : null;
  }
  async findByIdForUpdate(id: string) {
    if (!this.known.has(id)) return null;
    this.locked.push(id);
    return this.lesson(id);
  }
  async markDraft(id: string) {
    this.drafted.push(id);
    this.revisions.set(id, this.revision(id) + 1);
  }
  revision(id: string) {
    return this.revisions.get(id) ?? 1;
  }
}

export class FakeBlocks {
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
  async touch(id: string) {
    this.rows.get(id)!.version += 1;
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

interface LevelRow {
  blockId: string;
  lessonId: string;
  level: LearningLevel;
  content: Record<string, unknown> | null;
}

export class FakeBlockLevels {
  rows: LevelRow[] = [];
  constructor(
    private readonly lessons: FakeLessons,
    private readonly blocks: FakeBlocks,
  ) {}

  private canonical(rows: LevelRow[]) {
    return LEARNING_LEVELS.flatMap((level) =>
      rows.filter((r) => r.level === level),
    );
  }
  async listByLesson(lessonId: string) {
    return this.rows
      .filter((r) => r.lessonId === lessonId)
      .map((r) => ({ blockId: r.blockId, level: r.level, content: r.content }));
  }
  async listByBlock(blockId: string): Promise<BlockLevelSetting[]> {
    return this.canonical(this.rows.filter((r) => r.blockId === blockId)).map(
      (r) => ({
        level: r.level,
        content: r.content,
      }),
    );
  }
  async find(blockId: string, level: LearningLevel) {
    const row = this.rows.find(
      (r) => r.blockId === blockId && r.level === level,
    );
    return row ? { blockId, level, content: row.content } : null;
  }
  async upsert(
    blockId: string,
    lessonId: string,
    level: LearningLevel,
    content: Record<string, unknown> | null,
  ) {
    // the composite foreign keys
    const block = this.blocks.rows.get(blockId);
    if (!block || block.lessonId !== lessonId)
      throw new Error('FK (block_id, lesson_id)');
    if (!(this.lessons.levelsOf.get(lessonId) ?? []).includes(level)) {
      throw new BusinessRuleError(
        `The lesson is not available at the ${level} level`,
      );
    }
    const existing = this.rows.find(
      (r) => r.blockId === blockId && r.level === level,
    );
    if (existing) existing.content = content;
    else this.rows.push({ blockId, lessonId, level, content });
  }
  async delete(blockId: string, level: LearningLevel) {
    this.rows = this.rows.filter(
      (r) => !(r.blockId === blockId && r.level === level),
    );
  }
  async deleteAllForBlock(blockId: string) {
    this.rows = this.rows.filter((r) => r.blockId !== blockId);
  }
  async copy(fromBlockId: string, toBlockId: string) {
    for (const row of this.rows.filter((r) => r.blockId === fromBlockId)) {
      this.rows.push({
        ...row,
        blockId: toBlockId,
        content: row.content === null ? null : structuredClone(row.content),
      });
    }
  }
  async findVisibleAt(lessonId: string, levels: readonly LearningLevel[]) {
    return this.rows
      .filter((r) => r.lessonId === lessonId && levels.includes(r.level))
      .map((r) => ({ blockId: r.blockId, level: r.level }));
  }
  /** Test helper: the stored content for one level, or undefined if the block is hidden there. */
  contentAt(blockId: string, level: LearningLevel) {
    return this.rows.find((r) => r.blockId === blockId && r.level === level)
      ?.content;
  }
  same(
    blockId: string,
    level: LearningLevel,
    content: Record<string, unknown> | null,
  ) {
    const row = this.rows.find(
      (r) => r.blockId === blockId && r.level === level,
    );
    return !!row && jsonContentEquals(row.content, content);
  }
}

export const inlineTransactions = {
  run: (work: (m: EntityManager) => unknown) => work({} as EntityManager),
} as unknown as TransactionRunner;
