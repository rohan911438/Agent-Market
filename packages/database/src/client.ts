import { PrismaClient } from '@prisma/client';

export * from '@prisma/client';

let sharedClient: PrismaClient | undefined;

export function createPrismaClient(databaseUrl?: string): PrismaClient {
  return new PrismaClient(databaseUrl ? { datasources: { db: { url: databaseUrl } } } : undefined);
}

/** Process-wide singleton so route handlers/repositories share one connection pool. */
export function getPrismaClient(databaseUrl?: string): PrismaClient {
  if (!sharedClient) {
    sharedClient = createPrismaClient(databaseUrl);
  }
  return sharedClient;
}

export async function disconnectPrisma(): Promise<void> {
  if (sharedClient) {
    await sharedClient.$disconnect();
    sharedClient = undefined;
  }
}
