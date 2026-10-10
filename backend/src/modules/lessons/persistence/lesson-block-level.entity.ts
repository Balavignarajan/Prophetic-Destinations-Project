import {
  Check,
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryColumn,
  UpdateDateColumn,
} from 'typeorm';

/**
 * One row = the block is visible at `level`. `content` is the full-replacement
 * variant for that level, or NULL to use the block's shared content.
 *
 * The migration adds two composite foreign keys that are deliberately not modelled
 * as relations here: (block_id, lesson_id) -> lesson_blocks(id, lesson_id), and
 * (lesson_id, level) -> lesson_levels(lesson_id, level). Together they guarantee a
 * block is only ever visible at levels its own lesson is available at.
 */
@Entity({ name: 'lesson_block_levels' })
@Check(
  'chk_lesson_block_levels_level',
  `"level" IN ('BEGINNER', 'INTERMEDIATE', 'ADVANCED')`,
)
@Check(
  'chk_lesson_block_levels_content',
  `"content" IS NULL OR (jsonb_typeof("content") = 'object' AND octet_length("content"::text) <= 200000)`,
)
export class LessonBlockLevelEntity {
  @PrimaryColumn({ name: 'block_id', type: 'uuid' })
  blockId: string;

  @PrimaryColumn({ type: 'varchar', length: 20 })
  level: string;

  @Index('idx_lesson_block_levels_lesson_id')
  @Column({ name: 'lesson_id', type: 'uuid' })
  lessonId: string;

  @Column({ type: 'jsonb', nullable: true })
  content: Record<string, unknown> | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
