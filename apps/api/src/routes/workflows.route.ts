import { AppError, WorkflowExecuteRequestSchema, type WorkflowExecuteResponse } from '@agentmarket/shared-types';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { AppContext } from '../context.js';
import { createRateLimitPreHandler } from '../middleware/rate-limit.js';
import { createX402PreHandler, type MeteredRouteMeta } from '../middleware/x402-payment.js';
import { executeWorkflow, probeWorkflowTotalPrice, validateWorkflowSteps } from '../services/workflow-executor.js';

const RESOURCE = '/v1/workflows/execute';

/**
 * The Orchestration Engine (Phase 12) — runs an ordered pipeline of
 * first-party metered calls against one upfront payment. See
 * services/workflow-executor.ts for the full architecture writeup (the
 * internal escrow settlement design, and why it never touches the real
 * x402 gate used by every other route).
 */
export function registerWorkflowRoutes(server: FastifyInstance, ctx: AppContext): void {
  const requireRateLimit = createRateLimitPreHandler(ctx);

  /**
   * The workflow's total price isn't known at route-registration time (it
   * depends on which steps were requested) — this resolver runs once per
   * request, inside the real, unmodified x402 gate (createX402PreHandler),
   * before any payment is taken. Pipeline validation happens here too, so
   * an invalid pipeline is rejected before the caller is asked to pay for
   * something that could never have succeeded.
   */
  async function resolveWorkflowMeta(request: FastifyRequest): Promise<MeteredRouteMeta> {
    const input = WorkflowExecuteRequestSchema.parse(request.body);

    const validationErrors = validateWorkflowSteps(input.steps);
    if (validationErrors.length > 0) {
      throw new AppError('VALIDATION_ERROR', 'This workflow pipeline is invalid.', 400, { errors: validationErrors });
    }

    const { perStepPriceUsd, totalPriceUsd } = await probeWorkflowTotalPrice(server, input.steps);
    request.workflowSteps = input.steps;
    request.workflowStepPricesUsd = perStepPriceUsd;

    return { resource: RESOURCE, priceUsd: totalPriceUsd };
  }

  server.post(
    RESOURCE,
    { preHandler: [requireRateLimit, createX402PreHandler(ctx, resolveWorkflowMeta)] },
    async (request, reply) => {
      // Guaranteed set: the preHandler only lets execution reach here after
      // a real payment settled (a missing/invalid payment sends its own
      // reply and short-circuits Fastify's request lifecycle before the
      // handler ever runs).
      const paymentContext = request.paymentContext!;
      await ctx.db.payments.markSettled(paymentContext.paymentRef, paymentContext.transactionId ?? 'unknown');

      const start = Date.now();
      const result = await executeWorkflow(
        ctx,
        request,
        paymentContext.paymentRef,
        request.workflowSteps!,
        request.workflowStepPricesUsd!,
      );

      await ctx.db.apiRequests.create({
        requestId: request.requestId,
        route: RESOURCE,
        // Mirrors the A2A task lifecycle's convention (routes/a2a/tasks.route.ts)
        // of a non-HTTP-verb method string marking a non-direct-HTTP origin —
        // here, one workflow call fanning out into several internal steps.
        method: 'WORKFLOW',
        ipAddress: request.ip,
        walletId: paymentContext.walletId,
        cacheHit: false,
        statusCode: 200,
        latencyMs: Math.max(0, Date.now() - start),
      });
      if (paymentContext.walletId) {
        await ctx.db.usage.record(RESOURCE, result.totalChargedUsd, paymentContext.walletId);
      }

      const body: WorkflowExecuteResponse = {
        steps: result.steps,
        totalChargedUsd: result.totalChargedUsd,
        refundedUsd: result.refundedUsd,
        failedStepIndex: result.failedStepIndex,
      };
      return reply.code(200).send(body);
    },
  );
}
