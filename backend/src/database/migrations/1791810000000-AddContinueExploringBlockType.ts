import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Adds the CONTINUE_EXPLORING lesson block type (feature register BLK-022 "Continue Exploring": manual links to next/related lessons). The type was not
 * in the block-type CHECK: the guide's component list does not include it (open decision D1, unresolved), the same situation as HISTORICAL_EVIDENCE and
 * GUIDED_DISCOVERY_QUESTION. The identifier is PROPOSED. Widening the CHECK is additive: no row changes. Runs after
 * AddGuidedDiscoveryBlockType1791800000000.
 */
const TYPES = [
  'RICH_TEXT', 'SECTION_INTRO', 'CALLOUT', 'SCRIPTURE_PASSAGE', 'SCRIPTURE_CONNECTION',
  'IMAGE', 'INTERACTIVE_IMAGE', 'SYMBOL_STUDY', 'WORD_STUDY', 'MAP', 'TIMELINE',
  'PROPHECY_EQUIVALENCE', 'PROPHECY_CALCULATION', 'PROPHECY_COMPARISON',
  'NARRATIVE_SCENE', 'EXPLORE_DEEPER', 'REFLECTION_STUDY_ACTIVITY', 'SUMMARY', 'QUIZ',
  'HISTORICAL_EVIDENCE', 'GUIDED_DISCOVERY_QUESTION',
];

const list = (types: string[]) => types.map((t) => `'${t}'`).join(', ');

export class AddContinueExploringBlockType1791810000000 implements MigrationInterface {
  name = 'AddContinueExploringBlockType1791810000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "lesson_blocks" DROP CONSTRAINT "chk_lesson_blocks_type"`);
    await queryRunner.query(
      `ALTER TABLE "lesson_blocks" ADD CONSTRAINT "chk_lesson_blocks_type" CHECK ("type" IN (${list([...TYPES, 'CONTINUE_EXPLORING'])}))`,
    );
  }

  /** Fails (by design) while any CONTINUE_EXPLORING block exists: remove those blocks first. */
  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "lesson_blocks" DROP CONSTRAINT "chk_lesson_blocks_type"`);
    await queryRunner.query(`ALTER TABLE "lesson_blocks" ADD CONSTRAINT "chk_lesson_blocks_type" CHECK ("type" IN (${list(TYPES)}))`);
  }
}
