import { randomUUID } from 'node:crypto';
import {
  A2A_ERROR_CODES,
  A2AJsonRpcRequestSchema,
  A2ASendMessageParamsSchema,
  A2ATaskIdParamsSchema,
  AppError,
  type A2ATask,
} from '@agentmarket/shared-types';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { ZodError } from 'zod';
import type { AppContext } from '../../context.js';
import { createRateLimitPreHandler } from '../../middleware/rate-limit.js';
import { createX402PreHandler, REPLAY_CACHE_TTL_SECONDS } from '../../middleware/x402-payment.js';
import { findFirstPartyTaskHandler } from '../../services/first-party-task-registry.js';
import { buildCatalogTools } from '../../services/mcp-catalog.js';

/** A protocol-level JSON-RPC error — mapped to `{jsonrpc, id, error}`, never to the plain HTTP error shape. */
class A2AError extends Error {
  constructor(
    readonly code: number,
    message: string,
    readonly data?: unknown,
  ) {
    super(message);
  }
}

/**
 * The A2A task lifecycle for first-party endpoints — a single JSON-RPC
 * endpoint per the public A2A spec, not a parallel server process (per the
 * phase's "New route module(s)... don't build a parallel server" note).
 *
 * Payment timing (see Phase 5's decision notes): pay at task creation,
 * execute synchronously — every first-party endpoint resolves in
 * milliseconds, so there is no meaningful "working" state. `tasks/get`
 * exists to satisfy the lifecycle shape and to let a client re-fetch a
 * result it already has; `tasks/cancel` on an already-completed task
 * correctly (and always) returns TaskNotCancelable — there's nothing
 * running to cancel.
 *
 * Task storage is an in-memory Map, not a DB table: the authoritative
 * result already comes back synchronously from `message/send`, so this is
 * a convenience cache for the lifetime of the process, not a durability
 * guarantee — consistent with the phase's steer away from building real
 * async task infrastructure that nothing here needs yet.
 */
export function registerA2ATaskRoutes(server: FastifyInstance, ctx: AppContext): void {
  const tasks = new Map<string, A2ATask>();

  server.post('/a2a', { preHandler: createRateLimitPreHandler(ctx) }, async (request, reply) => {
    const rpc = A2AJsonRpcRequestSchema.parse(request.body);

    let result: unknown;
    try {
      result = await dispatch(ctx, rpc.method, rpc.params, request, reply, tasks);
    } catch (err) {
      if (err instanceof A2AError) {
        return { jsonrpc: '2.0' as const, id: rpc.id, error: { code: err.code, message: err.message, data: err.data } };
      }
      throw err; // AppError / ZodError / unexpected -> Fastify's normal error handler, same shape as the HTTP path
    }

    // The payment gate (missing-payment case) already sent a plain HTTP 402
    // directly — same shape as the HTTP path, deliberately not JSON-RPC
    // wrapped. Don't send a second response on top of it.
    if (reply.sent) return;

    return { jsonrpc: '2.0' as const, id: rpc.id, result };
  });
}

async function dispatch(
  ctx: AppContext,
  method: string,
  params: unknown,
  request: FastifyRequest,
  reply: FastifyReply,
  tasks: Map<string, A2ATask>,
): Promise<unknown> {
  switch (method) {
    case 'message/send':
      return handleMessageSend(ctx, params, request, reply, tasks);
    case 'tasks/get':
      return handleTasksGet(params, tasks);
    case 'tasks/cancel':
      return handleTasksCancel(params, tasks);
    default:
      throw new A2AError(A2A_ERROR_CODES.MethodNotFound, `Unknown method "${method}".`);
  }
}

async function handleMessageSend(
  ctx: AppContext,
  params: unknown,
  request: FastifyRequest,
  reply: FastifyReply,
  tasks: Map<string, A2ATask>,
): Promise<A2ATask | undefined> {
  const { message } = parseOrA2AError(A2ASendMessageParamsSchema, params, 'params');

  const skillId = typeof message.metadata?.skillId === 'string' ? message.metadata.skillId : undefined;
  if (!skillId) {
    throw new A2AError(
      A2A_ERROR_CODES.InvalidParams,
      'message.metadata.skillId is required to select which AgentMarket skill to invoke — fetch /.well-known/agent.json for the current catalog.',
    );
  }

  const tools = await buildCatalogTools(ctx);
  const tool = tools.find((t) => t.name === skillId);
  if (!tool) {
    throw new A2AError(A2A_ERROR_CODES.InvalidParams, `Unknown skill "${skillId}". Fetch /.well-known/agent.json for the current catalog.`);
  }
  if (tool.agentmarket.isThirdParty) {
    throw new A2AError(
      A2A_ERROR_CODES.UnsupportedOperation,
      `"${skillId}" is a third-party listing — discoverable but not yet invocable via A2A (no gateway to its upstream).`,
    );
  }

  const registryEntry = findFirstPartyTaskHandler(tool.agentmarket.resource);
  if (!registryEntry) {
    // Every first-party MCP tool has a registry entry — see first-party-task-registry.ts.
    throw new A2AError(A2A_ERROR_CODES.InternalError, `No task handler registered for "${skillId}".`);
  }

  const dataPart = message.parts.find((p) => p.kind === 'data');
  const rawInput = dataPart?.data ?? {};

  // Fail free: validate input *before* the payment gate runs, so a caller
  // is never charged for a call that could never have succeeded — mirrors
  // registerMeteredRoute's preValidation-before-preHandler ordering.
  const schema = registryEntry.querySchema ?? registryEntry.bodySchema;
  let parsedInput: unknown;
  try {
    parsedInput = schema ? schema.parse(rawInput) : rawInput;
  } catch (err) {
    if (err instanceof ZodError) {
      throw new A2AError(A2A_ERROR_CODES.InvalidParams, 'Task input failed validation.', { issues: err.issues });
    }
    throw err;
  }

  const x402Gate = createX402PreHandler(ctx, { resource: tool.agentmarket.resource, priceUsd: tool.agentmarket.priceUsd ?? 0 });
  await x402Gate(request, reply);
  if (reply.sent) return undefined; // 402 / missing payment — plain HTTP shape, handled by the caller

  const start = Date.now();
  const handlerResult = await registryEntry.run(ctx, { query: parsedInput, body: parsedInput, request });

  // Replicate registerMeteredRoute's settlement/audit bookkeeping so the
  // payment ledger, replay cache, and usage/spend-cap accounting stay
  // consistent regardless of whether a call came in over HTTP or A2A.
  const paymentContext = request.paymentContext;
  if (paymentContext) {
    const taskId = randomUUID();
    const task: A2ATask = {
      id: taskId,
      contextId: message.contextId ?? randomUUID(),
      kind: 'task',
      status: { state: 'completed', timestamp: new Date().toISOString() },
      artifacts: [{ artifactId: randomUUID(), name: 'result', parts: [{ kind: 'data', data: handlerResult.body }] }],
      history: [message],
    };

    const expiresAt = new Date(Date.now() + REPLAY_CACHE_TTL_SECONDS * 1000);
    const cached = await ctx.db.cachedResponses.upsert(
      `payment:${paymentContext.paymentRef}`,
      tool.agentmarket.resource,
      JSON.stringify(task),
      expiresAt,
    );
    await ctx.db.payments.markSettled(paymentContext.paymentRef, paymentContext.transactionId ?? 'unknown', cached.id);

    await ctx.db.apiRequests.create({
      requestId: request.requestId,
      route: tool.agentmarket.resource,
      method: 'A2A',
      ipAddress: request.ip,
      walletId: paymentContext.walletId,
      providerUsed: handlerResult.providers.join(',') || undefined,
      cacheHit: handlerResult.cacheHit,
      statusCode: 200,
      latencyMs: Math.max(0, Date.now() - start),
    });
    if (paymentContext.walletId) {
      await ctx.db.usage.record(tool.agentmarket.resource, tool.agentmarket.priceUsd ?? 0, paymentContext.walletId);
    }

    tasks.set(taskId, task);
    return task;
  }

  // No paymentContext means the gate replayed an already-settled payment
  // directly onto `reply` (reply.sent is true in that branch too) — the
  // check above already returned before reaching here in that case.
  throw new AppError('INTERNAL_ERROR', 'Payment gate completed without a payment context.', 500);
}

function handleTasksGet(params: unknown, tasks: Map<string, A2ATask>): A2ATask {
  const { id } = parseOrA2AError(A2ATaskIdParamsSchema, params, 'params');
  const task = tasks.get(id);
  if (!task) throw new A2AError(A2A_ERROR_CODES.TaskNotFound, `No task found with id "${id}".`);
  return task;
}

function handleTasksCancel(params: unknown, tasks: Map<string, A2ATask>): never {
  const { id } = parseOrA2AError(A2ATaskIdParamsSchema, params, 'params');
  const task = tasks.get(id);
  if (!task) throw new A2AError(A2A_ERROR_CODES.TaskNotFound, `No task found with id "${id}".`);
  throw new A2AError(
    A2A_ERROR_CODES.TaskNotCancelable,
    `Task "${id}" already reached a terminal state ("${task.status.state}") before the cancel request arrived — AgentMarket's first-party endpoints execute synchronously, so there is never anything in flight to cancel.`,
  );
}

function parseOrA2AError<T>(schema: { parse: (input: unknown) => T }, input: unknown, label: string): T {
  try {
    return schema.parse(input);
  } catch (err) {
    if (err instanceof ZodError) {
      throw new A2AError(A2A_ERROR_CODES.InvalidParams, `Invalid ${label}.`, { issues: err.issues });
    }
    throw err;
  }
}
