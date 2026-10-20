import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Adds the MEDIA_ANIMATION lesson block type (feature register BLK-016 "Media / Animation Asset", P0). The type was not in the block-type CHECK: the guide's
 * 19 components do not list it (open decision D1), the same situation as HISTORICAL_EVIDENCE, GUIDED_DISCOVERY_QUESTION and CONTINUE_EXPLORING. The identifier
 * is PROPOSED. Widening the CHECK is additive: no row changes. Runs after AddContinueExploringBlockType1791810000000.
 */
const TYPES = [
  'RICH_TEXT', 'SECTION_INTRO', 'CALLOUT', 'SCRIPTURE_PASSAGE', 'SCRIPTURE_CONNECTION',
  'IMAGE', 'INTERACTIVE_IMAGE', 'SYMBOL_STUDY', 'WORD_STUDY', 'MAP', 'TIMELINE',
  'PROPHECY_EQUIVALENCE', 'PROPHECY_CALCULATION', 'PROPHECY_COMPARISON',
  'NARRATIVE_SCENE', 'EXPLORE_DEEPER', 'REFLECTION_STUDY_ACTIVITY', 'SUMMARY', 'QUIZ',
  'HISTORICAL_EVIDENCE', 'GUIDED_DISCOVERY_QUESTION', 'CONTINUE_EXPLORING',
];

const list = (types: string[]) => types.map((t) => `'${t}'`).join(', ');

export class AddMediaAnimationBlockType1791820000000 implements MigrationInterface {
  name = 'AddMediaAnimationBlockType1791820000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "lesson_blocks" DROP CONSTRAINT "chk_lesson_blocks_type"`);
    await queryRunner.query(
      `ALTER TABLE "lesson_blocks" ADD CONSTRAINT "chk_lesson_blocks_type" CHECK ("type" IN (${list([...TYPES, 'MEDIA_ANIMATION'])}))`,
    );
  }

  /** Fails (by design) while any MEDIA_ANIMATION block exists: remove those blocks first. */
  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "lesson_blocks" DROP CONSTRAINT "chk_lesson_blocks_type"`);
    await queryRunner.query(`ALTER TABLE "lesson_blocks" ADD CONSTRAINT "chk_lesson_blocks_type" CHECK ("type" IN (${list(TYPES)}))`);
  }
}
