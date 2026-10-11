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
import { CourseEntity } from './course.entity.js';

@Entity({ name: 'course_modules' })
// Deferrable so a whole-course reorder or shift is checked once, at the end of the statement.
@Unique('UQ_course_modules_course_id_position', ['courseId', 'position'], {
  deferrable: 'INITIALLY IMMEDIATE',
})
// Lets rows that name a module AND a course (catalog publications, workflow events) prove they agree.
@Unique('UQ_course_modules_id_course_id', ['id', 'courseId'])
@Check('chk_course_modules_position', `"position" >= 1`)
@Check(
  'chk_course_modules_title',
  `btrim("title") <> '' AND char_length("title") <= 200`,
)
@Check(
  'chk_course_modules_status',
  `"status" IN ('DRAFT', 'READY_FOR_REVIEW', 'APPROVED', 'PUBLISHED')`,
)
export class CourseModuleEntity {
  @PrimaryColumn({ type: 'uuid', default: () => 'gen_random_uuid()' })
  id: string;

  @Column({ name: 'course_id', type: 'uuid' })
  courseId: string;

  // RESTRICT: a course with modules cannot be deleted (decided in Phase 3D).
  @ManyToOne(() => CourseEntity, { onDelete: 'RESTRICT' })
  @JoinColumn({
    name: 'course_id',
    foreignKeyConstraintName: 'FK_course_modules_course_id',
  })
  course?: CourseEntity;

  @Column({ type: 'varchar', length: 200 })
  title: string;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  @Column({ type: 'varchar', length: 20, default: 'DRAFT' })
  status: string;

  @Column({ type: 'integer' })
  position: number;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;

  @VersionColumn({ default: 1 })
  version: number;
}
