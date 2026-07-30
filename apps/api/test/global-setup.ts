import { execSync } from 'node:child_process';
import { existsSync, rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

/**
 * Integration tests run against a real (throwaway) SQLite database rather
 * than mocking Prisma — `prisma db push` materializes the schema once
 * before the suite starts.
 */
export default async function globalSetup(): Promise<void> {
  const databasePkgDir = fileURLToPath(new URL('../../../packages/database', import.meta.url));
  const testDbPath = fileURLToPath(new URL('../test.db', import.meta.url));

  if (existsSync(testDbPath)) rmSync(testDbPath);

  process.env.DATABASE_URL = `file:${testDbPath}`;

  execSync('npx prisma db push --skip-generate --accept-data-loss', {
    cwd: databasePkgDir,
    env: { ...process.env, DATABASE_URL: process.env.DATABASE_URL },
    stdio: 'inherit',
  });
}
