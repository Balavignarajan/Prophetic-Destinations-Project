import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Reusable blocks (CMS-014): copy-based templates of a lesson block. Runs after AddCourseBook1791880000000. MUST BE APPLIED before the Reusable Blocks library works
 * (the admin screens and the save/insert endpoints answer with an error until then). Nothing else needs it: lessons, publishing, the learner API and the media library
 * all keep working without the table (the media usage count treats a missing table as no templates).
 *
 * One new table, nothing changed in any existing one:
 *  - `shared_content` is the source block's shared content and `levels` the list of levels it was visible at, `[{ "level": "...", "content": {...} | null }]`, `content`
 *    being that level's own version (null = uses the shared content). Both are validated by the application with the block type registry on every write.
 *  - `type` deliberately has no list of block types in a CHECK: the registry decides which types are valid, so a new block type never needs a migration here.
 *  - No foreign key to any lesson, block, publication or snapshot: a template is independent of the place it was saved from. Deleting a lesson or a block never
 *    deletes a template, and deleting a template never touches a lesson. The only reference is `created_by` (RESTRICT, like quizzes and media).
 *  - Size limits mirror lesson_blocks / lesson_block_levels (200000 bytes per content, three levels at most).
 *
 * ROLLBACK: down() drops the table and every template in it. Lessons are not affected.
 */
export class CreateReusableBlocks1791890000000 implements MigrationInterface {
  name = 'CreateReusableBlocks1791890000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "reusable_blocks" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "name" character varying(120) NOT NULL,
        "description" character varying(500),
        "type" character varying(40) NOT NULL,
        "shared_content" jsonb,
        "levels" jsonb NOT NULL DEFAULT '[]'::jsonb,
        "version" integer NOT NULL DEFAULT 1,
        "created_by" uuid NOT NULL,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_reusable_blocks_id" PRIMARY KEY ("id"),
        CONSTRAINT "FK_reusable_blocks_created_by" FOREIGN KEY ("created_by")
          REFERENCES "admins" ("id") ON DELETE RESTRICT ON UPDATE NO ACTION,
        CONSTRAINT "chk_reusable_blocks_name" CHECK (char_length(btrim("name")) BETWEEN 1 AND 120),
        CONSTRAINT "chk_reusable_blocks_description" CHECK ("description" IS NULL OR char_length("description") <= 500),
        CONSTRAINT "chk_reusable_blocks_version" CHECK ("version" >= 1),
        CONSTRAINT "chk_reusable_blocks_shared_content" CHECK (
          "shared_content" IS NULL
          OR (jsonb_typeof("shared_content") = 'object' AND octet_length("shared_content"::text) <= 200000)
        ),
        CONSTRAINT "chk_reusable_blocks_levels" CHECK (
          jsonb_typeof("levels") = 'array'
          AND jsonb_array_length("levels") <= 3
          AND octet_length("levels"::text) <= 600000
        )
      )
    `);
    await queryRunner.query(`CREATE INDEX "idx_reusable_blocks_updated_at_id" ON "reusable_blocks" ("updated_at", "id")`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "reusable_blocks"`);
  }
}
