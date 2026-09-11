import { randomUUID } from 'node:crypto';
import type {
  PaymentPayload,
  PaymentRequirement,
  PaymentSettleResult,
  PaymentVerifyResult,
} from '@rohankumar4179/shared-types';
import type { PaymentContext, PaymentProvider } from './payment-provider.interface.js';

/**
 * Debits an already-collected workflow escrow instead of verifying a real
 * signed payment (Phase 12 — the Orchestration Engine). Each step in a
 * `POST /v1/workflows/execute` pipeline is normally gated by a real x402
 * PaymentProvider expecting a fresh, signed X-PAYMENT header per call; that
 * model doesn't fit an engine running several steps against one upfront
 * payment. This class exists so that internal settlement has a single,
 * clearly-named, heavily-documented home instead of being scattered inline.
 *
 * SECURITY — read this before touching either this file or its call site:
 *
 *   - `verify()` and `settle()` below always succeed unconditionally. That
 *     is only safe because of where this class is (and is not) used:
 *
 *     1. It is never passed to `createPaymentProviderRegistry` / never
 *        becomes `ctx.paymentService`'s active provider (see
 *        apps/api/src/build-context.ts) — so no code that resolves "the"
 *        payment provider for a request can ever get this one.
 *     2. It is never wired into `createX402PreHandler` for any
 *        externally-reachable route — no HTTP endpoint decodes an
 *        attacker-supplied header and hands it to this class.
 *     3. Its only caller is apps/api/src/services/workflow-executor.ts,
 *        which invokes it as a plain in-process function call — never
 *        through Fastify routing — and only *after* the workflow's own
 *        real upfront payment (verified through the real configured
 *        provider, via the normal x402 gate on
 *        POST /v1/workflows/execute) has already settled for an amount
 *        covering every step about to run.
 *
 *   - If you find yourself wiring this into any Fastify route, preHandler,
 *     or the provider registry: stop — that would make step execution
 *     payable with nothing, for real, externally. That is the mistake this
 *     entire comment exists to prevent.
 */
export class EscrowPaymentProvider implements PaymentProvider {
  readonly id = 'workflow-escrow';
  readonly x402Version = 1;

  getRequirements(context: PaymentContext): PaymentRequirement[] {
    return [
      {
        scheme: 'workflow-escrow',
        network: 'internal',
        maxAmountRequired: Math.round(context.priceUsd * 1_000_000).toString(),
        resource: context.resource,
        description: `Internal escrow debit for ${context.resource} — settled from a workflow's upfront payment, never a standalone real payment.`,
        mimeType: 'application/json',
        payTo: 'INTERNAL_WORKFLOW_ESCROW',
        asset: 'INTERNAL_USD',
        maxTimeoutSeconds: 60,
      },
    ];
  }

  /** Always valid — see the class-level SECURITY comment for why that's safe here and only here. Arguments are accepted (matching PaymentProvider's shape) but never inspected. */
  async verify(_payload: PaymentPayload, _requirement: PaymentRequirement): Promise<PaymentVerifyResult> {
    return { isValid: true };
  }

  /** Always succeeds — no real transaction exists to fail; the real money already moved once, upfront, for the whole workflow. */
  async settle(_payload: PaymentPayload, _requirement: PaymentRequirement): Promise<PaymentSettleResult> {
    return { success: true, transactionId: `internal-escrow-${randomUUID()}`, network: 'internal' };
  }
}

/** A minimal, always-ignored payload — verify()/settle() above never inspect their arguments, but the PaymentProvider interface shape requires one. */
export function buildEscrowPaymentPayload(requirement: PaymentRequirement): PaymentPayload {
  return { x402Version: 1, scheme: requirement.scheme, network: requirement.network, payload: {} };
}
