import type { DataSource } from 'typeorm';

/**
 * Deletes the workflow events of the lessons selected by `lessonIdsSql` (a SELECT of lesson ids).
 *
 * Workflow history is append-only: the database rejects every DELETE. Tests that create events
 * therefore have to remove them with the append-only triggers switched off, inside one
 * transaction (the ALTER is transactional and holds an exclusive lock, so no other session ever
 * observes the triggers disabled). Test cleanup only; the application has no way to do this.
 */
export async function deleteWorkflowEvents(
  dataSource: DataSource,
  lessonIdsSql: string,
  params: unknown[],
): Promise<void> {
  await dataSource.transaction(async (manager) => {
    await manager.query(
      `ALTER TABLE "lesson_workflow_events" DISABLE TRIGGER USER`,
    );
    await manager.query(
      `DELETE FROM "lesson_workflow_events" WHERE "lesson_id" IN (${lessonIdsSql})`,
      params,
    );
    await manager.query(
      `ALTER TABLE "lesson_workflow_events" ENABLE TRIGGER USER`,
    );
  });
}
