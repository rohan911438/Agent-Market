import { createPrismaClient, Database } from '@agentmarket/database';
import { describe, expect, it } from 'vitest';
import { buildServer } from '../src/server.js';
import { checkOverallHealth } from '../src/observability/health-checks.js';
import { buildTestContext } from './helpers/build-test-context.js';

/**
 * Acceptance criterion: "/status renders correctly and reflects a
 * simulated degradation — write a test... that intentionally breaks a
 * dependency (e.g., point the database check at an unreachable path) and
 * confirms the status page reflects it." /status has no test runner of its
 * own (apps/web has none — see other phases' notes on this), so this is
 * the backend half: proving the exact data /status renders (GET /health,
 * and by extension checkOverallHealth, which the synthetic monitor also
 * calls) correctly reports a broken dependency. The frontend rendering of
 * that JSON was verified manually against a live dev server.
 */
describe('health reflects a real dependency degradation', () => {
  it('reports healthy:true and HTTP 200 when every dependency is reachable', async () => {
    const server = buildServer(buildTestContext());
    await server.ready();
    const res = await server.inject({ method: 'GET', url: '/health' });
    expect(res.statusCode).toBe(200);
    expect(res.json().status).toBe('ok');
    expect(res.json().dependencies.database.status).toBe('ok');
    await server.close();
  });

  it('reports healthy:false, HTTP 503, and the specific broken dependency when the database is unreachable', async () => {
    // A directory that doesn't exist — SQLite/Prisma cannot create the
    // containing path, so every query against this client genuinely fails,
    // simulating "unreachable" without needing a real second database.
    const brokenDb = new Database(
      createPrismaClient('file:./this/directory/does/not/exist/unreachable.db'),
    );
    const ctx = buildTestContext();
    const brokenCtx = { ...ctx, db: brokenDb };

    const result = await checkOverallHealth(brokenCtx);
    expect(result.healthy).toBe(false);
    expect(result.dependencies.database.status).toBe('error');
    expect(result.dependencies.database.error).toBeTruthy();

    const server = buildServer(brokenCtx);
    await server.ready();
    const res = await server.inject({ method: 'GET', url: '/health' });
    expect(res.statusCode).toBe(503);
    expect(res.json().status).toBe('error');
    expect(res.json().dependencies.database.status).toBe('error');
    await server.close();
    await brokenDb.disconnect();
  });
});
