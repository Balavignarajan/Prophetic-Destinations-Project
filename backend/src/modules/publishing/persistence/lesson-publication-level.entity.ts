import { Check, Column, Entity, PrimaryColumn } from 'typeorm';

/**
 * The immutable, self-contained snapshot of one level of one publication. The migration
 * also installs triggers that reject UPDATE, DELETE and TRUNCATE (and INSERT into an
 * ended publication), and a composite foreign key (publication_id, lesson_id) that ties
 * the row to a publication of the same lesson. Written only through PublicationRepository.
 */
@Entity({ name: 'lesson_publication_levels' })
@Check(
  'chk_lesson_publication_levels_level',
  `"level" IN ('BEGINNER', 'INTERMEDIATE', 'ADVANCED')`,
)
@Check(
  'chk_lesson_publication_levels_content',
  `jsonb_typeof("content") = 'object'`,
)
@Check(
  'chk_lesson_publication_levels_hash',
  `"content_hash" ~ '^[0-9a-f]{64}$'`,
)
@Check(
  'chk_lesson_publication_levels_bytes',
  `"content_bytes" BETWEEN 1 AND 5242880`,
)
export class LessonPublicationLevelEntity {
  @PrimaryColumn({ name: 'publication_id', type: 'uuid' })
  publicationId: string;

  @Column({ name: 'lesson_id', type: 'uuid' })
  lessonId: string;

  @PrimaryColumn({ type: 'varchar', length: 20 })
  level: string;

  @Column({ type: 'jsonb' })
  content: Record<string, unknown>;

  @Column({ name: 'content_hash', type: 'char', length: 64 })
  contentHash: string;

  @Column({ name: 'content_bytes', type: 'integer' })
  contentBytes: number;
}
