import type { DataSource } from 'typeorm';

/**
 * In the order the publish path writes them (publication, then its snapshots, then the event).
 * Locking in the same order keeps concurrent test suites from deadlocking with a publish.
 */
const WRITE_ORDER = [
  'lesson_publications',
  'lesson_publication_levels',
  'lesson_workflow_events',
];
/** Children before parents, for the deletes. */
const DELETE_ORDER = [...WRITE_ORDER].reverse();

/**
 * Deletes the workflow events, publications and publication snapshots of the lessons
 * selected by `lessonIdsSql` (a SELECT of lesson ids).
 *
 * This history is append-only: the database rejects every DELETE. Tests that create it
 * therefore have to remove it with the guard triggers switched off, inside one transaction
 * (the ALTER is transactional and holds an exclusive lock, so no other session ever
 * observes the triggers disabled). Test cleanup only; the application has no way to do this.
 * Children go first: events, then snapshots, then publications.
 */
export async function deleteWorkflowHistory(
  dataSource: DataSource,
  lessonIdsSql: string,
  params: unknown[],
): Promise<void> {
  await dataSource.transaction(async (manager) => {
    for (const table of WRITE_ORDER) {
      await manager.query(`ALTER TABLE "${table}" DISABLE TRIGGER USER`);
    }
    for (const table of DELETE_ORDER) {
      await manager.query(
        `DELETE FROM "${table}" WHERE "lesson_id" IN (${lessonIdsSql})`,
        params,
      );
    }
    for (const table of WRITE_ORDER) {
      await manager.query(`ALTER TABLE "${table}" ENABLE TRIGGER USER`);
    }
  });
}
