import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import Fastify, { type FastifyInstance } from 'fastify';
import { randomUUID } from 'node:crypto';
import type { AppContext } from './context.js';
import { registerErrorHandler } from './plugins/error-handler.js';
import { registerRoutes } from './routes/index.js';

export function buildServer(ctx: AppContext): FastifyInstance {
  const server = Fastify({
    logger: { level: ctx.config.server.logLevel },
    genReqId: () => randomUUID(),
    trustProxy: true,
  });

  server.decorateRequest('requestId', '');
  server.decorateRequest('startTimeMs', 0);

  server.addHook('onRequest', async (request) => {
    request.requestId = request.id;
    request.startTimeMs = Date.now();
  });

  server.register(helmet);
  server.register(cors, {
    origin: ctx.config.server.corsOrigin,
    exposedHeaders: ['x-wallet-token', 'x-payment-replay', 'x-ratelimit-limit', 'x-ratelimit-remaining', 'retry-after'],
  });

  registerErrorHandler(server);
  registerRoutes(server, ctx);

  return server;
}
