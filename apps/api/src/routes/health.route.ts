import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { FastifyInstance } from 'fastify';
import type { AppContext } from '../context.js';
import { checkOverallHealth } from '../observability/health-checks.js';

const { version } = JSON.parse(
  readFileSync(fileURLToPath(new URL('../../package.json', import.meta.url)), 'utf-8'),
) as { version: string };

export function registerHealthRoute(server: FastifyInstance, ctx: AppContext): void {
  server.get('/health', async (_request, reply) => {
    const { healthy, dependencies } = await checkOverallHealth(ctx);

    reply.code(healthy ? 200 : 503).send({
      status: healthy ? 'ok' : 'error',
      version,
      timestamp: new Date().toISOString(),
      dependencies,
    });
  });
}
