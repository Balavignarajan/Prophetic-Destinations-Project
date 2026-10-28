import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Adds the INTERACTIVE_3D_MODEL lesson block type (Batch 32: a GLB 3D model that learners will be able to rotate and zoom). The type was not in the block-type CHECK, and no
 * document lists it (open decision D1), the same situation as MEDIA_ANIMATION; the identifier is PROPOSED. Widening the CHECK is additive: no row changes. Nothing else in the
 * database changes: media_assets has no content-type constraint, so a GLB file is stored like any other upload. Runs after MoveHomeEntryLinkToCourses1791930000000.
 */
const TYPES = [
  'RICH_TEXT', 'SECTION_INTRO', 'CALLOUT', 'SCRIPTURE_PASSAGE', 'SCRIPTURE_CONNECTION',
  'IMAGE', 'INTERACTIVE_IMAGE', 'SYMBOL_STUDY', 'WORD_STUDY', 'MAP', 'TIMELINE',
  'PROPHECY_EQUIVALENCE', 'PROPHECY_CALCULATION', 'PROPHECY_COMPARISON',
  'NARRATIVE_SCENE', 'EXPLORE_DEEPER', 'REFLECTION_STUDY_ACTIVITY', 'SUMMARY', 'QUIZ',
  'HISTORICAL_EVIDENCE', 'GUIDED_DISCOVERY_QUESTION', 'CONTINUE_EXPLORING', 'MEDIA_ANIMATION',
];

const list = (types: string[]) => types.map((t) => `'${t}'`).join(', ');

export class AddInteractive3dModelBlockType1791940000000 implements MigrationInterface {
  name = 'AddInteractive3dModelBlockType1791940000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "lesson_blocks" DROP CONSTRAINT "chk_lesson_blocks_type"`);
    await queryRunner.query(
      `ALTER TABLE "lesson_blocks" ADD CONSTRAINT "chk_lesson_blocks_type" CHECK ("type" IN (${list([...TYPES, 'INTERACTIVE_3D_MODEL'])}))`,
    );
  }

  /** Fails (by design) while any INTERACTIVE_3D_MODEL block exists: remove those blocks first. */
  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "lesson_blocks" DROP CONSTRAINT "chk_lesson_blocks_type"`);
    await queryRunner.query(`ALTER TABLE "lesson_blocks" ADD CONSTRAINT "chk_lesson_blocks_type" CHECK ("type" IN (${list(TYPES)}))`);
  }
}
