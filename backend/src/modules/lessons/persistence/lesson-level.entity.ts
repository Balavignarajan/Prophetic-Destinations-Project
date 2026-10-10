import { Check, Entity, JoinColumn, ManyToOne, PrimaryColumn } from 'typeorm';
import { LessonEntity } from './lesson.entity.js';

/** One row per level a lesson is available at. No row = not available at that level. */
@Entity({ name: 'lesson_levels' })
@Check(
  'chk_lesson_levels_level',
  `"level" IN ('BEGINNER', 'INTERMEDIATE', 'ADVANCED')`,
)
export class LessonLevelEntity {
  @PrimaryColumn({ name: 'lesson_id', type: 'uuid' })
  lessonId: string;

  @PrimaryColumn({ type: 'varchar', length: 20 })
  level: string;

  @ManyToOne(() => LessonEntity, { onDelete: 'RESTRICT' })
  @JoinColumn({
    name: 'lesson_id',
    foreignKeyConstraintName: 'FK_lesson_levels_lesson_id',
  })
  lesson?: LessonEntity;
}
