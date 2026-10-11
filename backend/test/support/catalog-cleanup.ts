import type { DataSource } from 'typeorm';

/**
 * In the order a catalog publication writes them: the publication, its module memberships and level
 * snapshots, then the workflow events. Locking the tables in the same order keeps concurrent test suites
 * from deadlocking with a publish.
 */
const WRITE_ORDER = [
  'course_publications',
  'course_publication_modules',
  'course_publication_levels',
  'catalog_workflow_events',
];
/** Children before parents, for the deletes. */
const DELETE_ORDER = [...WRITE_ORDER].reverse();

/**
 * Deletes the catalog publications, memberships, snapshots and workflow events of the courses selected by
 * `courseIdsSql` (a SELECT of course ids).
 *
 * This history is append-only: the database rejects every DELETE. Tests that create it therefore have to
 * remove it with the guard triggers switched off, inside one transaction (the ALTER is transactional and
 * holds a strong lock, so no other session ever observes the triggers disabled). Test cleanup only; the
 * application has no way to do this. Call it BEFORE deleting the courses and modules themselves.
 */
export async function deleteCatalogHistory(
  dataSource: DataSource,
  courseIdsSql: string,
  params: unknown[],
): Promise<void> {
  await dataSource.transaction(async (manager) => {
    for (const table of WRITE_ORDER) {
      await manager.query(`ALTER TABLE "${table}" DISABLE TRIGGER USER`);
    }
    for (const table of DELETE_ORDER) {
      await manager.query(
        `DELETE FROM "${table}" WHERE "course_id" IN (${courseIdsSql})`,
        params,
      );
    }
    for (const table of WRITE_ORDER) {
      await manager.query(`ALTER TABLE "${table}" ENABLE TRIGGER USER`);
    }
  });
}
