import {
  Check,
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryColumn,
  Unique,
  UpdateDateColumn,
  VersionColumn,
} from 'typeorm';
import { LessonEntity } from './lesson.entity.js';

/**
 * A block placement in a lesson. The migration also installs a trigger that
 * refuses any change to `type` (a block's type is immutable); triggers are not
 * modelled in entities.
 */
@Entity({ name: 'lesson_blocks' })
// Deferrable so a shift or whole-lesson reorder is checked once, at the end of the statement.
@Unique('UQ_lesson_blocks_lesson_id_position', ['lessonId', 'position'], {
  deferrable: 'INITIALLY IMMEDIATE',
})
// Not deferrable: it is the target of lesson_block_levels' composite foreign key.
@Unique('UQ_lesson_blocks_id_lesson_id', ['id', 'lessonId'])
@Check('chk_lesson_blocks_position', `"position" >= 1`)
@Check(
  'chk_lesson_blocks_type',
  `"type" IN ('RICH_TEXT', 'SECTION_INTRO', 'CALLOUT', 'SCRIPTURE_PASSAGE', 'SCRIPTURE_CONNECTION', 'IMAGE', 'INTERACTIVE_IMAGE', 'SYMBOL_STUDY', 'WORD_STUDY', 'MAP', 'TIMELINE', 'PROPHECY_EQUIVALENCE', 'PROPHECY_CALCULATION', 'PROPHECY_COMPARISON', 'NARRATIVE_SCENE', 'EXPLORE_DEEPER', 'REFLECTION_STUDY_ACTIVITY', 'SUMMARY', 'QUIZ', 'HISTORICAL_EVIDENCE', 'GUIDED_DISCOVERY_QUESTION', 'CONTINUE_EXPLORING', 'MEDIA_ANIMATION', 'INTERACTIVE_3D_MODEL')`,
)
@Check(
  'chk_lesson_blocks_shared_content',
  `"shared_content" IS NULL OR (jsonb_typeof("shared_content") = 'object' AND octet_length("shared_content"::text) <= 200000)`,
)
export class LessonBlockEntity {
  @PrimaryColumn({ type: 'uuid', default: () => 'gen_random_uuid()' })
  id: string;

  @Column({ name: 'lesson_id', type: 'uuid' })
  lessonId: string;

  @ManyToOne(() => LessonEntity, { onDelete: 'RESTRICT' })
  @JoinColumn({
    name: 'lesson_id',
    foreignKeyConstraintName: 'FK_lesson_blocks_lesson_id',
  })
  lesson?: LessonEntity;

  @Column({ type: 'varchar', length: 40 })
  type: string;

  @Column({ type: 'integer' })
  position: number;

  @Column({ name: 'shared_content', type: 'jsonb', nullable: true })
  sharedContent: Record<string, unknown> | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;

  @VersionColumn({ default: 1 })
  version: number;
}
