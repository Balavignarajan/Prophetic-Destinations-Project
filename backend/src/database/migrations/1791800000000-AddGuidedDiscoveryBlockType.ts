import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Adds the GUIDED_DISCOVERY_QUESTION lesson block type (feature register BLK-019 "Guided Discovery Question", P2). The type was not in the block-type
 * CHECK: the guide's 19 components do not list it (open decision D1: which component list governs), the same situation as HISTORICAL_EVIDENCE. The
 * identifier is PROPOSED (named after the workbook component, like REFLECTION_STUDY_ACTIVITY) and, like HISTORICAL_EVIDENCE, is a development choice
 * that stays subject to D1. Widening the CHECK is additive: no row changes. Runs after AddMediaCaption1791790000000.
 */
const TYPES = [
  'RICH_TEXT', 'SECTION_INTRO', 'CALLOUT', 'SCRIPTURE_PASSAGE', 'SCRIPTURE_CONNECTION',
  'IMAGE', 'INTERACTIVE_IMAGE', 'SYMBOL_STUDY', 'WORD_STUDY', 'MAP', 'TIMELINE',
  'PROPHECY_EQUIVALENCE', 'PROPHECY_CALCULATION', 'PROPHECY_COMPARISON',
  'NARRATIVE_SCENE', 'EXPLORE_DEEPER', 'REFLECTION_STUDY_ACTIVITY', 'SUMMARY', 'QUIZ',
  'HISTORICAL_EVIDENCE',
];

const list = (types: string[]) => types.map((t) => `'${t}'`).join(', ');

export class AddGuidedDiscoveryBlockType1791800000000 implements MigrationInterface {
  name = 'AddGuidedDiscoveryBlockType1791800000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "lesson_blocks" DROP CONSTRAINT "chk_lesson_blocks_type"`);
    await queryRunner.query(
      `ALTER TABLE "lesson_blocks" ADD CONSTRAINT "chk_lesson_blocks_type" CHECK ("type" IN (${list([...TYPES, 'GUIDED_DISCOVERY_QUESTION'])}))`,
    );
  }

  /** Fails (by design) while any GUIDED_DISCOVERY_QUESTION block exists: remove those blocks first. */
  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "lesson_blocks" DROP CONSTRAINT "chk_lesson_blocks_type"`);
    await queryRunner.query(`ALTER TABLE "lesson_blocks" ADD CONSTRAINT "chk_lesson_blocks_type" CHECK ("type" IN (${list(TYPES)}))`);
  }
}
