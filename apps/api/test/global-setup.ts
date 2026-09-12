import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { PrismaClient } from '@prisma/client';

/**
 * Integration tests run against a real (throwaway) Postgres database rather
 * than mocking Prisma. Bring one up first:
 *
 *   docker compose --profile postgres up -d postgres
 *
 * `DATABASE_URL` is honoured when it points at Postgres (CI sets it to its
 * own `postgres` service); otherwise it defaults to the local docker-compose
 * instance. Every run drops and recreates the `public` schema so it starts
 * from a clean slate, then `prisma db push` materialises the current schema
 * into the empty database.
 */
const DEFAULT_TEST_DATABASE_URL = 'postgresql://agentmarket:agentmarket@localhost:5432/agentmarket';

export default async function globalSetup(): Promise<void> {
  const databasePkgDir = fileURLToPath(new URL('../../../packages/database', import.meta.url));

  const databaseUrl = process.env.DATABASE_URL?.startsWith('postgres')
    ? process.env.DATABASE_URL
    : DEFAULT_TEST_DATABASE_URL;
  process.env.DATABASE_URL = databaseUrl;

  // Reset by dropping the schema rather than `prisma db push --force-reset`,
  // which some environments intentionally block. `public` is Postgres's
  // default schema; recreating it empty is equivalent to a fresh database.
  const prisma = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
  try {
    await prisma.$executeRawUnsafe('DROP SCHEMA IF EXISTS public CASCADE');
    await prisma.$executeRawUnsafe('CREATE SCHEMA public');
  } finally {
    await prisma.$disconnect();
  }

  execSync('npx prisma db push --skip-generate', {
    cwd: databasePkgDir,
    env: { ...process.env, DATABASE_URL: databaseUrl },
    stdio: 'inherit',
  });
}
