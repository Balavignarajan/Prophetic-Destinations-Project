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
 * One topic on the learner Home screen, managed in the Admin CMS (Batch 28, reshaped in 28.1). It holds MANY courses: the courses point at it through `courses.home_entry_id`
 * (so an entry can have none, and deleting it only unassigns them). `imageMediaId` is an optional card picture (ON DELETE RESTRICT: an image in use cannot be deleted),
 * `position` its 1-based place on Home, `isEnabled` hides it without deleting it.
 *
 * The migrations also create a UNIQUE index on lower(btrim(title)) (only when the existing titles allowed it) and a partial index on the image. Those are expression / partial
 * indexes, which the decorators cannot describe, so they exist only in the migrations (the schema is never synchronized); the application enforces unique titles itself.
 */
@Entity({ name: 'home_entries' })
@Index('idx_home_entries_position_id', ['position', 'id'])
@Check('chk_home_entries_title', `char_length(btrim("title")) BETWEEN 1 AND 120`)
@Check('chk_home_entries_description', `"description" IS NULL OR char_length(btrim("description")) BETWEEN 1 AND 500`)
@Check('chk_home_entries_position', `"position" >= 1`)
@Check('chk_home_entries_version', `"version" >= 1`)
@Check(
  'chk_home_entries_visible_levels',
  `"visible_levels" IS NULL OR (cardinality("visible_levels") >= 1 AND "visible_levels" <@ ARRAY['BEGINNER', 'INTERMEDIATE', 'ADVANCED']::text[] AND cardinality(array_positions("visible_levels", 'BEGINNER')) <= 1 AND cardinality(array_positions("visible_levels", 'INTERMEDIATE')) <= 1 AND cardinality(array_positions("visible_levels", 'ADVANCED')) <= 1)`,
)
export class HomeEntryEntity {
  @PrimaryColumn({ type: 'uuid', default: () => 'gen_random_uuid()' })
  id: string;

  @Column({ type: 'varchar', length: 120 })
  title: string;

  @Column({ type: 'varchar', length: 500, nullable: true })
  description: string | null;

  /** A media_assets id (an image), or null: then the card shows the cover of its first published course. */
  @Column({ name: 'image_media_id', type: 'uuid', nullable: true })
  imageMediaId: string | null;

  /** 1-based place on the learner Home. */
  @Column({ type: 'int' })
  position: number;

  @Column({ name: 'is_enabled', type: 'boolean', default: true })
  isEnabled: boolean;

  /**
   * The learning levels the entry is shown at (Batch 54; migration AddHomeEntryVisibleLevels1791960000000). NULL = every level: every entry that existed before keeps showing at all three, and
   * "all three" is stored as NULL too. Otherwise a non-empty subset of BEGINNER / INTERMEDIATE / ADVANCED, each at most once. The domain model always shows the explicit list.
   */
  @Column({ name: 'visible_levels', type: 'text', array: true, nullable: true })
  visibleLevels: string[] | null;

  @VersionColumn({ default: 1 })
  version: number;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
