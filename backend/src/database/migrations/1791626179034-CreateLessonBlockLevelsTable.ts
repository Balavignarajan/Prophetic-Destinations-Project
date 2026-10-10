import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Block visibility and level variants: the `lesson_block_levels` table.
 * The only change to an existing table is one extra non-deferrable unique
 * constraint on `lesson_blocks (id, lesson_id)`, which the composite foreign key
 * below needs as its target. down() removes exactly what up() adds.
 */
export class CreateLessonBlockLevelsTable1791626179034 implements MigrationInterface {
  name = 'CreateLessonBlockLevelsTable1791626179034';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Non-deferrable (the default): a foreign key may only reference an immediately-enforced unique constraint.
    await queryRunner.query(
      `ALTER TABLE "lesson_blocks" ADD CONSTRAINT "UQ_lesson_blocks_id_lesson_id" UNIQUE ("id", "lesson_id")`,
    );

    await queryRunner.query(`
      CREATE TABLE "lesson_block_levels" (
        "block_id" uuid NOT NULL,
        "lesson_id" uuid NOT NULL,
        "level" character varying(20) NOT NULL,
        "content" jsonb,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_lesson_block_levels" PRIMARY KEY ("block_id", "level"),
        -- The row's lesson is always the block's lesson.
        CONSTRAINT "FK_lesson_block_levels_block" FOREIGN KEY ("block_id", "lesson_id")
          REFERENCES "lesson_blocks" ("id", "lesson_id") ON DELETE RESTRICT ON UPDATE NO ACTION,
        -- A block can only be visible at a level its lesson is available at.
        CONSTRAINT "FK_lesson_block_levels_lesson_level" FOREIGN KEY ("lesson_id", "level")
          REFERENCES "lesson_levels" ("lesson_id", "level") ON DELETE RESTRICT ON UPDATE NO ACTION,
        CONSTRAINT "chk_lesson_block_levels_level"
          CHECK ("level" IN ('BEGINNER', 'INTERMEDIATE', 'ADVANCED')),
        CONSTRAINT "chk_lesson_block_levels_content" CHECK (
          "content" IS NULL
          OR (jsonb_typeof("content") = 'object' AND octet_length("content"::text) <= 200000)
        )
      )
    `);
    // The primary key also serves lookups by block_id. Lookups by lesson_id use the foreign key's table scan,
    // which is fine at CMS scale (a lesson has at most 500 blocks x 3 levels).
    await queryRunner.query(
      `CREATE INDEX "idx_lesson_block_levels_lesson_id" ON "lesson_block_levels" ("lesson_id")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "lesson_block_levels"`);
    await queryRunner.query(
      `ALTER TABLE "lesson_blocks" DROP CONSTRAINT "UQ_lesson_blocks_id_lesson_id"`,
    );
  }
}
