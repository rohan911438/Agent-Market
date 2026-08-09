import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import { SpanStatusCode } from '@opentelemetry/api';
import Fastify, { type FastifyInstance } from 'fastify';
import type { AppContext } from './context.js';
import { startRootSpan } from './observability/tracing.js';
import { registerErrorHandler } from './plugins/error-handler.js';
import { registerRoutes } from './routes/index.js';

export function buildServer(ctx: AppContext): FastifyInstance {
  const server = Fastify({
    logger: { level: ctx.config.server.logLevel },
    trustProxy: true,
  });

  server.decorateRequest('requestId', '');
  server.decorateRequest('startTimeMs', 0);
  server.decorateRequest('otelSpan', undefined);

  server.addHook('onRequest', async (request) => {
    // One id, not two: the request's trace id *is* its requestId — see
    // tracing.ts and fastify.d.ts. Every span for this request (rate limit,
    // payment gate, handler — see register-metered-route.ts) is a child of
    // this root span, so the whole lifecycle shows up as one trace.
    const span = startRootSpan(`${request.method} ${request.routeOptions?.url ?? request.url}`);
    request.otelSpan = span;
    request.requestId = span.spanContext().traceId;
    request.startTimeMs = Date.now();
  });

  server.addHook('onResponse', async (request, reply) => {
    const span = request.otelSpan;
    if (!span) return;
    span.setAttribute('http.status_code', reply.statusCode);
    span.setStatus({ code: reply.statusCode >= 500 ? SpanStatusCode.ERROR : SpanStatusCode.OK });
    span.end();
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
