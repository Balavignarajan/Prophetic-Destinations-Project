import type { DataSource, EntityManager } from 'typeorm';

/**
 * Test fixtures for lessons that are PUBLISHED without going through the publish workflow.
 *
 * The database requires a PUBLISHED lesson to have an active publication (checked at commit), so a
 * fixture that simply sets `status = 'PUBLISHED'` is rejected. These helpers add the minimum a real
 * publication has (a publication row for the lesson's current content), exactly like a publish would
 * before it moves the status. They bypass the services on purpose, so the suites that use them still test
 * the code under test, not the publish path. Test code only.
 */
export async function ensureActivePublication(
  manager: EntityManager,
  lessonId: string,
): Promise<void> {
  const [existing] = await manager.query(
    `SELECT 1 FROM "lesson_publications" WHERE "lesson_id" = $1 AND "ended_at" IS NULL`,
    [lessonId],
  );
  if (existing) return;
  await manager.query(
    `INSERT INTO "lesson_publications"
       ("lesson_id", "version", "module_id", "source_content_revision", "snapshot_schema_version", "published_by")
     SELECT l."id",
            COALESCE((SELECT max(p."version") FROM "lesson_publications" p WHERE p."lesson_id" = l."id"), 0) + 1,
            l."module_id", l."content_revision", 1,
            (SELECT "id" FROM "admins" ORDER BY "created_at" LIMIT 1)
       FROM "lessons" l WHERE l."id" = $1`,
    [lessonId],
  );
}

/** Sets a lesson's status directly; PUBLISHED also gets the active publication the database requires. */
export async function forceStatus(
  dataSource: DataSource,
  lessonId: string,
  status: string,
): Promise<void> {
  await dataSource.transaction(async (manager) => {
    if (status === 'PUBLISHED')
      await ensureActivePublication(manager, lessonId);
    await manager.query(`UPDATE "lessons" SET "status" = $2 WHERE "id" = $1`, [
      lessonId,
      status,
    ]);
  });
}
