import { ExactAvmScheme } from '@x402-avm/avm/exact/client';
import type { ClientAvmSigner } from '@x402-avm/avm';
import type { PaymentRequirements } from '@x402-avm/core/types';
import type { PaymentRequirement } from '@agentmarket/shared-types';

/**
 * Client-side helper for the demo payment flow. When the backend runs with
 * PAYMENT_PROVIDER=mock (the default), MockPaymentProvider only needs a
 * payload carrying a nonce and the payer's address — so a connected wallet
 * address plus a fresh nonce is enough to exercise the *full* 402 -> pay ->
 * 200 UX without requiring funded TestNet accounts for every visitor.
 *
 * Used whenever the 402 response's `network` is `"mock"`; see
 * `buildRealPaymentHeader` for the real Algorand TestNet/mainnet path.
 */
export function buildDemoPaymentHeader(address: string): string {
  const payload = {
    x402Version: 1,
    scheme: 'exact',
    network: 'mock',
    payload: {
      address,
      nonce: `${address}-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    },
  };
  return typeof window === 'undefined'
    ? Buffer.from(JSON.stringify(payload), 'utf-8').toString('base64')
    : window.btoa(JSON.stringify(payload));
}

function encodePaymentPayload(payload: unknown): string {
  const json = JSON.stringify(payload);
  return typeof window === 'undefined' ? Buffer.from(json, 'utf-8').toString('base64') : window.btoa(json);
}

/**
 * `PaymentRequirement.network` is a plain string in our own schema (it also
 * has to hold the literal `"mock"`), but `@x402-avm/core`'s `network` field
 * is typed as a CAIP-2 id (`${namespace}:${reference}`). The real
 * `algorand-x402` provider always emits one (see
 * `packages/payments/src/algorand-x402-provider.ts`'s `ALGORAND_CAIP2_NETWORK`)
 * — this asserts that at runtime rather than silently casting past it.
 */
function assertCaip2Requirement(requirement: PaymentRequirement): PaymentRequirements {
  if (!requirement.network.includes(':')) {
    throw new Error(`Expected a CAIP-2 network id (e.g. "algorand:...") for a real payment, got "${requirement.network}"`);
  }
  return requirement as PaymentRequirements;
}

/**
 * Builds a real, signed X-PAYMENT header for the `algorand-x402` provider —
 * used whenever the 402 response's `network` is not `"mock"`. Mirrors
 * `scripts/testnet/demo-payment.mjs`'s proven envelope-wrapping: the v2 SDK's
 * `createPaymentPayload()` returns only `{x402Version, payload}`, so the flat
 * `{scheme, network}` from the `PaymentRequirement` the 402 response carried
 * has to be added back in to match our own `PaymentPayloadSchema`.
 */
export async function buildRealPaymentHeader(
  signer: ClientAvmSigner,
  x402Version: number,
  requirement: PaymentRequirement,
): Promise<string> {
  const scheme = new ExactAvmScheme(signer);
  const { payload } = await scheme.createPaymentPayload(x402Version, assertCaip2Requirement(requirement));
  return encodePaymentPayload({
    x402Version,
    scheme: requirement.scheme,
    network: requirement.network,
    payload,
  });
}
