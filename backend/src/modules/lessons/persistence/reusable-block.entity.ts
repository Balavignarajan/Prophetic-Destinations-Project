import {
  Check,
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryColumn,
  UpdateDateColumn,
  VersionColumn,
} from 'typeorm';

/**
 * A reusable block (CMS-014): a COPY-BASED template of a lesson block. It is not a lesson block and has no relation to any lesson, block, publication or learner
 * record: it is only ever read by the authorised admin endpoints, and a lesson block inserted from it is a new, independent row.
 *
 * `levels` is the list of levels the source block was visible at, `[{ level, content }]`, `content` being that level's own version or null (the shared content).
 * `type` has no CHECK listing the block types on purpose: the block type registry decides which types are valid, so adding a type never needs a migration here.
 * created_by is the admin who saved it (RESTRICT, like quizzes and media: an account that owns reusable blocks cannot be deleted).
 */
@Entity({ name: 'reusable_blocks' })
@Index('idx_reusable_blocks_updated_at_id', ['updatedAt', 'id'])
@Check('chk_reusable_blocks_name', `char_length(btrim("name")) BETWEEN 1 AND 120`)
@Check('chk_reusable_blocks_description', `"description" IS NULL OR char_length("description") <= 500`)
@Check('chk_reusable_blocks_version', `"version" >= 1`)
@Check(
  'chk_reusable_blocks_shared_content',
  `"shared_content" IS NULL OR (jsonb_typeof("shared_content") = 'object' AND octet_length("shared_content"::text) <= 200000)`,
)
@Check(
  'chk_reusable_blocks_levels',
  `jsonb_typeof("levels") = 'array' AND jsonb_array_length("levels") <= 3 AND octet_length("levels"::text) <= 600000`,
)
export class ReusableBlockEntity {
  @PrimaryColumn({ type: 'uuid', default: () => 'gen_random_uuid()' })
  id: string;

  @Column({ type: 'varchar', length: 120 })
  name: string;

  @Column({ type: 'varchar', length: 500, nullable: true })
  description: string | null;

  @Column({ type: 'varchar', length: 40 })
  type: string;

  @Column({ name: 'shared_content', type: 'jsonb', nullable: true })
  sharedContent: Record<string, unknown> | null;

  @Column({ type: 'jsonb', default: () => `'[]'::jsonb` })
  levels: unknown;

  @VersionColumn({ default: 1 })
  version: number;

  @Column({ name: 'created_by', type: 'uuid' })
  createdBy: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
