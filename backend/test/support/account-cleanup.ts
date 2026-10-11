import type { DataSource } from 'typeorm';

/**
 * Deletes the test admins whose email matches `emailLike`, together with the account-management audit rows that
 * mention them (as subject or actor).
 *
 * The audit trail is append-only: the database rejects every DELETE. Tests that create it therefore remove it with
 * the guard triggers switched off, inside one transaction (the ALTER is transactional and holds a strong lock, so
 * no other session ever observes the triggers disabled). Test cleanup only; the application has no way to do this.
 * Refresh tokens go with their admin (ON DELETE CASCADE).
 */
export async function deleteAccountHistory(
  dataSource: DataSource,
  emailLike: string,
): Promise<void> {
  await dataSource.transaction(async (manager) => {
    await manager.query(
      `ALTER TABLE "admin_account_events" DISABLE TRIGGER USER`,
    );
    await manager.query(
      `DELETE FROM "admin_account_events"
        WHERE "subject_admin_id" IN (SELECT "id" FROM "admins" WHERE "email" LIKE $1)
           OR "actor_admin_id" IN (SELECT "id" FROM "admins" WHERE "email" LIKE $1)`,
      [emailLike],
    );
    await manager.query(
      `ALTER TABLE "admin_account_events" ENABLE TRIGGER USER`,
    );
    await manager.query(`DELETE FROM "admins" WHERE "email" LIKE $1`, [
      emailLike,
    ]);
  });
}
