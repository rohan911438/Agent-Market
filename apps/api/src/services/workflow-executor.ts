/**
 * The Orchestration Engine (Phase 12) — a stateless pipeline executor that
 * runs several first-party metered endpoints in sequence against one
 * upfront payment, with partial refund accounting on mid-pipeline failure.
 *
 * ARCHITECTURE — the load-bearing decision for this whole phase, written
 * down here as the phase's own instructions require before any route code:
 *
 *   Each step's resource (e.g. /v1/sentiment) is normally gated by
 *   `createX402PreHandler`, which expects a real, freshly-signed X-PAYMENT
 *   header per call. A pipeline can't do that per step without either (a)
 *   the caller paying N separate real payments up front, defeating "one
 *   upfront payment", or (b) the engine somehow satisfying each step's real
 *   gate itself.
 *
 *   The design chosen here is (c), which turned out simpler and safer than
 *   either: DON'T route step execution back through Fastify/the real x402
 *   gate at all. Instead:
 *
 *     1. `POST /v1/workflows/execute` itself IS gated by the real,
 *        unmodified x402 flow (see routes/workflows.route.ts), for a price
 *        computed dynamically as the sum of every step's live price
 *        (probed via `server.inject` 402 probes — see
 *        `probeWorkflowTotalPrice` below — never a hardcoded assumption).
 *        This is one real, fully-verified, fully-settled payment.
 *     2. Once that real payment has settled, THIS module calls each step's
 *        already-exported handler function directly, in-process
 *        (`sentimentHandler`, `riskAnalysisHandler`, etc. — see
 *        workflow-step-registry.ts) — the exact same intelligence-engine
 *        logic the real HTTP routes call, just invoked without going
 *        through Fastify routing or any preHandler at all.
 *     3. Each successfully-completed step gets its own `Payment` row,
 *        settled via `EscrowPaymentProvider` (packages/payments) — an
 *        internal-only bookkeeping device, never reachable from any HTTP
 *        request (see that class's own SECURITY comment for the full
 *        argument). This keeps per-step spend visible in the ledger
 *        without a second, real payment ever being collected.
 *
 *   Why this is safer than modifying `createX402PreHandler` to accept some
 *   internal bypass token: nothing about the shared gate used by every
 *   other metered route changes AT ALL. There is no new conditional branch
 *   in security-critical, widely-shared code for a bypass to accidentally
 *   leak out of. The "internal settlement path" is not a mode of the real
 *   gate — it's a completely separate function that is simply never wired
 *   to any Fastify route. See test/workflows.integration.test.ts's
 *   "external bypass" tests for the automated proof.
 *
 * REFUNDS: AgentMarket's payment rails (packages/payments) have no
 * mechanism to reverse an already-settled real transaction — building one
 * would be "actually moving money" a second time, explicitly out of scope
 * here (same line Phase 07 drew for payouts). So a "refund" in this phase
 * is a LEDGER ADJUSTMENT, not a real transfer: an unexecuted step's
 * `Payment` row is recorded with `status: 'REFUNDED'` rather than
 * `'SETTLED'`, and the response reports the exact amount — but no money
 * actually moves back to the caller. A future phase, once real refund
 * rails exist, could reconcile these rows into an actual transfer or
 * credit; this phase makes that reconciliation possible by recording the
 * truth precisely, not by promising something the rails can't do yet.
 */

import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { AppContext } from '../context.js';
import { buildEscrowPaymentPayload, EscrowPaymentProvider } from '@agentmarket/payments';
import { findStepReferences, resolveStepParams } from './workflow-templating.js';
import { isKnownWorkflowStepResource, WORKFLOW_STEP_REGISTRY } from './workflow-step-registry.js';

export interface WorkflowStepInput {
  resource: string;
  params: Record<string, unknown>;
}

/** Every validation error found — empty means the pipeline is valid. Checked before any payment is taken (see routes/workflows.route.ts). */
export function validateWorkflowSteps(steps: WorkflowStepInput[]): string[] {
  const errors: string[] = [];

  if (steps.length === 0) {
    return ['A workflow must have at least one step.'];
  }

  steps.forEach((step, index) => {
    if (!isKnownWorkflowStepResource(step.resource)) {
      errors.push(`Step ${index}: unknown or unsupported resource "${step.resource}".`);
      return; // no point checking this step's references against an unknown resource
    }
    for (const ref of findStepReferences(step.params)) {
      if (ref.stepIndex < 0 || ref.stepIndex >= index) {
        const reason = ref.stepIndex === index ? 'references itself' : "references a step that hasn't run yet or doesn't exist";
        errors.push(`Step ${index}: ${reason} (step ${ref.stepIndex}).`);
      }
    }
  });

  return errors;
}

const escrowProvider = new EscrowPaymentProvider();

/**
 * Sums each step's *current* live price via a real 402 probe (in-process,
 * via `server.inject` — no network hop) rather than any hardcoded
 * assumption, so this can never drift from what the route would actually
 * charge a direct caller. Probing uses each step's registered dummy
 * params (see workflow-step-registry.ts) — price is a flat constant
 * independent of params for every registered step today, so any validly-
 * shaped input works; the caller's real params (which may still contain
 * unresolved `{{steps[...]}}` references at this point) are never used here.
 */
export async function probeWorkflowTotalPrice(
  server: FastifyInstance,
  steps: WorkflowStepInput[],
): Promise<{ perStepPriceUsd: number[]; totalPriceUsd: number }> {
  const perStepPriceUsd = await Promise.all(
    steps.map(async (step) => {
      const stepDef = WORKFLOW_STEP_REGISTRY[step.resource];
      if (!stepDef) throw new Error(`Unknown workflow step resource "${step.resource}" reached pricing — validate first.`);

      const probe =
        stepDef.method === 'GET'
          ? await server.inject({
              method: 'GET',
              url: `${step.resource}?${new URLSearchParams(stepDef.dummyParamsForPricing as Record<string, string>).toString()}`,
            })
          : await server.inject({ method: 'POST', url: step.resource, payload: stepDef.dummyParamsForPricing });

      if (probe.statusCode !== 402) {
        throw new Error(`Expected HTTP 402 while pricing workflow step "${step.resource}", got ${probe.statusCode}.`);
      }
      const body = probe.json() as { accepts: Array<{ maxAmountRequired: string }> };
      const requirement = body.accepts[0];
      if (!requirement) throw new Error(`Pricing probe for "${step.resource}" returned no payment requirement.`);
      return Number(requirement.maxAmountRequired) / 1_000_000;
    }),
  );

  return { perStepPriceUsd, totalPriceUsd: perStepPriceUsd.reduce((sum, p) => sum + p, 0) };
}

export interface WorkflowStepOutcome {
  resource: string;
  status: 'completed' | 'failed' | 'skipped';
  priceUsd: number;
  output?: unknown;
  error?: string;
}

export interface WorkflowExecutionResult {
  steps: WorkflowStepOutcome[];
  totalChargedUsd: number;
  refundedUsd: number;
  failedStepIndex: number | null;
}

/**
 * Runs `steps` in order against the given `perStepPriceUsd` (already
 * probed and already covered by the workflow's real, settled upfront
 * payment). Stops at the first failure — a step "fails" either because its
 * handler throws, or because its resolved params don't pass that step's
 * own real schema (e.g. a `{{steps[...]}}` reference resolved to
 * `undefined` for a required field). A failed step is never charged; every
 * step from the failure onward is recorded as refunded/skipped.
 */
export async function executeWorkflow(
  ctx: AppContext,
  request: FastifyRequest,
  workflowPaymentRef: string,
  steps: WorkflowStepInput[],
  perStepPriceUsd: number[],
): Promise<WorkflowExecutionResult> {
  const outcomes: WorkflowStepOutcome[] = [];
  const priorOutputs: unknown[] = [];
  let failedStepIndex: number | null = null;

  for (let i = 0; i < steps.length; i++) {
    const step = steps[i]!;
    const priceUsd = perStepPriceUsd[i]!;
    const stepDef = WORKFLOW_STEP_REGISTRY[step.resource]!; // already validated

    if (failedStepIndex !== null) {
      outcomes.push({ resource: step.resource, status: 'skipped', priceUsd });
      await recordRefundedStep(ctx, workflowPaymentRef, i, step.resource, priceUsd);
      continue;
    }

    try {
      const resolvedParams = resolveStepParams(step.params, priorOutputs);
      const parsedParams = stepDef.schema.parse(resolvedParams);
      const result = await stepDef.run(ctx, parsedParams, request);

      await settleStepFromEscrow(ctx, workflowPaymentRef, i, step.resource, priceUsd);

      priorOutputs.push(result.body);
      outcomes.push({ resource: step.resource, status: 'completed', priceUsd, output: result.body });
    } catch (err) {
      failedStepIndex = i;
      priorOutputs.push(undefined);
      outcomes.push({
        resource: step.resource,
        status: 'failed',
        priceUsd,
        error: err instanceof Error ? err.message : 'Step failed for an unknown reason.',
      });
      await recordRefundedStep(ctx, workflowPaymentRef, i, step.resource, priceUsd);
    }
  }

  const totalChargedUsd = outcomes.filter((o) => o.status === 'completed').reduce((sum, o) => sum + o.priceUsd, 0);
  const refundedUsd = outcomes.filter((o) => o.status !== 'completed').reduce((sum, o) => sum + o.priceUsd, 0);

  return { steps: outcomes, totalChargedUsd, refundedUsd, failedStepIndex };
}

/** Debits the escrow for one successfully-completed step — see the module's ARCHITECTURE comment. */
async function settleStepFromEscrow(
  ctx: AppContext,
  workflowPaymentRef: string,
  stepIndex: number,
  resource: string,
  priceUsd: number,
): Promise<void> {
  const requirement = escrowProvider.getRequirements({ resource, priceUsd })[0]!;
  const paymentRef = `${workflowPaymentRef}#step${stepIndex}`;

  await ctx.db.payments.create({
    paymentRef,
    resource,
    amountAtomic: requirement.maxAmountRequired,
    asset: requirement.asset,
    network: requirement.network,
    scheme: requirement.scheme,
  });

  const settleResult = await escrowProvider.settle(buildEscrowPaymentPayload(requirement), requirement);
  await ctx.db.payments.markSettled(paymentRef, settleResult.transactionId ?? 'internal-escrow');
}

/** Records a ledger-only refund for a step that never ran (or failed) — no real money moves, see the module's REFUNDS comment. */
async function recordRefundedStep(
  ctx: AppContext,
  workflowPaymentRef: string,
  stepIndex: number,
  resource: string,
  priceUsd: number,
): Promise<void> {
  const requirement = escrowProvider.getRequirements({ resource, priceUsd })[0]!;
  await ctx.db.payments.create({
    paymentRef: `${workflowPaymentRef}#step${stepIndex}`,
    resource,
    amountAtomic: requirement.maxAmountRequired,
    asset: requirement.asset,
    network: requirement.network,
    scheme: requirement.scheme,
  });
  await ctx.db.payments.markRefunded(`${workflowPaymentRef}#step${stepIndex}`);
}
