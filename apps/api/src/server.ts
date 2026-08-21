import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import { SpanStatusCode } from '@opentelemetry/api';
import Fastify, { type FastifyInstance } from 'fastify';
import type { AppContext } from './context.js';
import { createRateLimitPreHandler } from './middleware/rate-limit.js';
import { startRootSpan, tracedPreHandler } from './observability/tracing.js';
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

  // Every route is rate-limited by default (IP, or wallet tier once
  // verified) — not just the x402-metered ones. Without this, unauthenticated
  // free endpoints (marketplace listing, provider registration, discovery
  // search) had no throughput ceiling at all: a DoS surface, and a way to
  // spam-write provider accounts for free. /health is excluded so
  // uptime/load-balancer probes never fail or eat into real traffic's
  // budget. Metered/A2A/workflow routes previously ran this same check
  // explicitly per-route before this hook existed — that call was removed
  // (see register-metered-route.ts, workflows.route.ts, a2a/tasks.route.ts)
  // so one request consumes exactly one token, not two.
  const requireRateLimit = tracedPreHandler('rate_limit.check', createRateLimitPreHandler(ctx));
  server.addHook('preHandler', async (request, reply) => {
    if (request.url === '/health' || request.url.startsWith('/health?')) return;
    await requireRateLimit(request, reply);
  });

  registerRoutes(server, ctx);

  return server;
}
