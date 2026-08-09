import { context, ROOT_CONTEXT, SpanStatusCode, trace, type Span } from '@opentelemetry/api';
import { resourceFromAttributes } from '@opentelemetry/resources';
import { ConsoleSpanExporter, SimpleSpanProcessor, type SpanExporter } from '@opentelemetry/sdk-trace-base';
import { NodeTracerProvider } from '@opentelemetry/sdk-trace-node';
import { ATTR_SERVICE_NAME } from '@opentelemetry/semantic-conventions';
import type { FastifyReply, FastifyRequest } from 'fastify';

const SERVICE_NAME = 'agentmarket-api';

/**
 * Real distributed tracing (Phase 13), scoped honestly: no OTel
 * collector/Honeycomb/Datadog credential is configured or approved for this
 * environment, so the only exporter wired up here is the console one — real,
 * inspectable spans, just printed rather than shipped anywhere. Swapping in
 * a real backend later is meant to be a config change, not a rewrite: the
 * *only* place that decides where spans go is `createSpanExporter` below —
 * add an `OTEL_EXPORTER_OTLP_ENDPOINT` branch there (install
 * `@opentelemetry/exporter-trace-otlp-http`, construct `new
 * OTLPTraceExporter({ url })`, and swap `SimpleSpanProcessor` for
 * `BatchSpanProcessor` so export batches instead of blocking per-span) —
 * nothing else in this file, or any of its callers, needs to change.
 */
function createSpanExporter(): SpanExporter {
  return new ConsoleSpanExporter();
}

let initialized = false;

/** Call once, at process start, before any request is handled — see main.ts. */
export function initTracing(): void {
  if (initialized) return;
  initialized = true;

  const provider = new NodeTracerProvider({
    resource: resourceFromAttributes({ [ATTR_SERVICE_NAME]: SERVICE_NAME }),
    spanProcessors: [new SimpleSpanProcessor(createSpanExporter())],
  });
  provider.register();
}

let testTracingInitialized = false;

/**
 * Test-only equivalent of `initTracing()` — registers a provider with *no*
 * span processors, so spans still get real, randomly generated trace/span
 * ids (see startRootSpan: `request.requestId` *is* the trace id, and with no
 * provider registered at all, OTel's no-op tracer hands back the same fixed
 * all-zero trace id for every span, which collides across requests and
 * violates ApiRequest's unique constraint on `requestId`) without printing
 * anything to the console or requiring a real backend. Called from
 * build-test-context.ts, not from `buildServer`/`buildTestContext` callers
 * directly, so every integration test file gets this exactly once.
 */
export function initTracingForTests(): void {
  if (testTracingInitialized) return;
  testTracingInitialized = true;

  const provider = new NodeTracerProvider({
    resource: resourceFromAttributes({ [ATTR_SERVICE_NAME]: SERVICE_NAME }),
    spanProcessors: [],
  });
  provider.register();
}

/**
 * Resolved fresh on every call rather than cached at module scope. OTel's
 * global tracer registration (`provider.register()`) can be resolved via a
 * different module instance than the one this file imported (e.g.
 * `@opentelemetry/sdk-trace-node`'s CJS build `require`s `@opentelemetry/api`
 * separately from this file's ESM `import`); `trace.getTracer()` always
 * re-resolves against whatever is currently registered on the shared
 * `globalThis` registry, so calling it lazily is what makes registration
 * order-independent. A tracer captured once at import time would instead be
 * bound permanently to whatever (possibly unregistered) provider existed at
 * that moment.
 */
function getTracer() {
  return trace.getTracer(SERVICE_NAME);
}

/**
 * Every span created for a request is a child of `request.otelSpan` (the
 * root span started in server.ts's `onRequest` hook) — this is how spans
 * stay correlated into one trace without needing Fastify-specific
 * auto-instrumentation.
 */
function parentContext(request: FastifyRequest) {
  return request.otelSpan ? trace.setSpan(context.active(), request.otelSpan) : context.active();
}

async function runInSpan<T>(name: string, request: FastifyRequest, fn: () => Promise<T>): Promise<T> {
  const span = getTracer().startSpan(name, undefined, parentContext(request));
  try {
    const result = await context.with(trace.setSpan(parentContext(request), span), fn);
    span.setStatus({ code: SpanStatusCode.OK });
    return result;
  } catch (err) {
    span.recordException(err instanceof Error ? err : new Error(String(err)));
    span.setStatus({ code: SpanStatusCode.ERROR, message: err instanceof Error ? err.message : String(err) });
    throw err;
  } finally {
    span.end();
  }
}

/** Wraps a Fastify preHandler in a child span — used for the rate-limit and payment-gate stages (see register-metered-route.ts). */
export function tracedPreHandler(
  name: string,
  fn: (request: FastifyRequest, reply: FastifyReply) => Promise<void> | void,
) {
  return (request: FastifyRequest, reply: FastifyReply): Promise<void> =>
    runInSpan(name, request, async () => {
      await fn(request, reply);
    });
}

/** Wraps a Fastify route handler in a child span. */
export function tracedHandler<T>(name: string, fn: (request: FastifyRequest, reply: FastifyReply) => Promise<T>) {
  return (request: FastifyRequest, reply: FastifyReply): Promise<T> => runInSpan(name, request, () => fn(request, reply));
}

/**
 * Starts the root span for a request — called from server.ts's `onRequest`
 * hook, for both real external requests and internal `server.inject()`
 * calls (e.g. workflow-executor.ts fanning a workflow out into its
 * per-step metered calls). Explicitly parented to `ROOT_CONTEXT` rather
 * than the ambient `context.active()`: an `inject()` call issued from
 * inside another request's handler span would otherwise become a *child*
 * span of that request's trace, inheriting its trace id — and since the
 * trace id *is* `request.requestId` (see fastify.d.ts), every internal
 * step would collide on the same id and fail ApiRequest's unique
 * constraint. Each request — internal or external — is its own request
 * and gets its own trace.
 */
export function startRootSpan(name: string): Span {
  return getTracer().startSpan(name, undefined, ROOT_CONTEXT);
}
