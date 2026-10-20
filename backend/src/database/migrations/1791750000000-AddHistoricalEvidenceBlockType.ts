import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Adds the HISTORICAL_EVIDENCE lesson block type (feature register BLK-020 / CMS-018). The type was not in the block-type CHECK because the
 * guide's list has 19 types and BLK-020 appears only in the workbook (open decision D1). Widening the CHECK is additive: no row changes.
 * Runs after AddCoverImages1791740000000.
 */
const TYPES = [
  'RICH_TEXT', 'SECTION_INTRO', 'CALLOUT', 'SCRIPTURE_PASSAGE', 'SCRIPTURE_CONNECTION',
  'IMAGE', 'INTERACTIVE_IMAGE', 'SYMBOL_STUDY', 'WORD_STUDY', 'MAP', 'TIMELINE',
  'PROPHECY_EQUIVALENCE', 'PROPHECY_CALCULATION', 'PROPHECY_COMPARISON',
  'NARRATIVE_SCENE', 'EXPLORE_DEEPER', 'REFLECTION_STUDY_ACTIVITY', 'SUMMARY', 'QUIZ',
];

const list = (types: string[]) => types.map((t) => `'${t}'`).join(', ');

export class AddHistoricalEvidenceBlockType1791750000000 implements MigrationInterface {
  name = 'AddHistoricalEvidenceBlockType1791750000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "lesson_blocks" DROP CONSTRAINT "chk_lesson_blocks_type"`);
    await queryRunner.query(
      `ALTER TABLE "lesson_blocks" ADD CONSTRAINT "chk_lesson_blocks_type" CHECK ("type" IN (${list([...TYPES, 'HISTORICAL_EVIDENCE'])}))`,
    );
  }

  /** Fails (by design) while any HISTORICAL_EVIDENCE block exists: remove those blocks first. */
  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "lesson_blocks" DROP CONSTRAINT "chk_lesson_blocks_type"`);
    await queryRunner.query(`ALTER TABLE "lesson_blocks" ADD CONSTRAINT "chk_lesson_blocks_type" CHECK ("type" IN (${list(TYPES)}))`);
  }
}
