import type { FastifyInstance } from 'fastify';

export function registerHealthRoute(server: FastifyInstance): void {
  server.get('/health', async () => ({ status: 'ok', timestamp: new Date().toISOString() }));
}
