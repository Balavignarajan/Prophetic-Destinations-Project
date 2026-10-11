import { Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { ConfigModule } from '../../../config/index.js';
import { DatabaseModule } from '../../../database/database.module.js';
import { AdminProvisioningService } from '../application/admin-provisioning.service.js';
import { IdentityModule } from '../identity.module.js';
import { Role } from '../domain/role.js';

/**
 * Creates the first ADMIN from environment variables. Safe to run repeatedly:
 * an existing account is left untouched. The password is never printed.
 *
 *   SEED_ADMIN_EMAIL, SEED_ADMIN_PASSWORD   (read from the environment or .env)
 */
@Module({ imports: [ConfigModule, DatabaseModule, IdentityModule] })
class SeedAdminModule {}

async function main(): Promise<number> {
  const app = await NestFactory.createApplicationContext(SeedAdminModule, {
    logger: ['error', 'warn'],
  });
  try {
    const email = process.env.SEED_ADMIN_EMAIL?.trim();
    const password = process.env.SEED_ADMIN_PASSWORD;
    if (!email || !password) {
      console.error('SEED_ADMIN_EMAIL and SEED_ADMIN_PASSWORD must be set.');
      return 1;
    }

    const { created } = await app
      .get(AdminProvisioningService)
      .ensure({ email, password, role: Role.ADMIN });
    console.log(
      created
        ? `Created ADMIN account for ${email.toLowerCase()}.`
        : `An account for ${email.toLowerCase()} already exists. Nothing changed (its password is NOT reset by this command).`,
    );
    return 0;
  } catch (error) {
    // Only the message: validation details list rules, never the password itself.
    console.error(`Seeding failed: ${(error as Error).message}`);
    const details = (error as { details?: unknown }).details;
    if (Array.isArray(details))
      details.forEach((line) => console.error(`- ${line}`));
    return 1;
  } finally {
    await app.close();
  }
}

process.exitCode = await main();
