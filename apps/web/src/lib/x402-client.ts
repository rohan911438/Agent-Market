import { ExactAvmScheme } from '@x402-avm/avm/exact/client';
import type { ClientAvmSigner } from '@x402-avm/avm';
import type { PaymentRequirements } from '@x402-avm/core/types';
import type { PaymentRequiredResponse, PaymentRequirement } from '@rohankumar4179/shared-types';
import algosdk from 'algosdk';
import { config } from './config';

/** The subset of the 402 response needed to echo back for Bazaar discovery — see AgentMarket's agent-sdk `DiscoveryEcho`. */
export type DiscoveryEcho = Pick<PaymentRequiredResponse, 'extensions' | 'resource'>;

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

/** Raw-bytes-to-base64 without assuming a `Buffer` polyfill is bundled for the browser. */
function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return typeof window === 'undefined' ? Buffer.from(bytes).toString('base64') : window.btoa(binary);
}

const ALGOD_URLS: Record<string, string> = {
  testnet: 'https://testnet-api.algonode.cloud',
  mainnet: 'https://mainnet-api.algonode.cloud',
};

/**
 * Sentinel `PaymentRequirement.asset` value a native-ALGO requirement carries
 * — see `NATIVE_ALGO_ASSET` in packages/payments/src/algorand-x402-provider.ts.
 * Duplicated here (not imported) since apps/web doesn't depend on
 * @agentmarket/payments — this is the wire-level contract, not a shared type.
 */
export const NATIVE_ALGO_ASSET = 'ALGO';

/**
 * Builds a real, signed X-PAYMENT header for a native-ALGO PaymentRequirement
 * (`requirement.asset === NATIVE_ALGO_ASSET`). Unlike `buildRealPaymentHeader`,
 * this does NOT go through `@x402-avm/avm`'s `ExactAvmScheme` — that library
 * hardcodes an ASA `AssetTransfer` transaction with no code path for a plain
 * native-currency `Payment` transaction, so a native-ALGO payment is built by
 * hand with `algosdk` directly. No atomic fee-payer group is needed either:
 * the payer already needs ALGO to make the payment at all, so it trivially
 * covers its own ~0.001 ALGO network fee too.
 */
export async function buildRealAlgoPaymentHeader(
  signer: ClientAvmSigner,
  x402Version: number,
  requirement: PaymentRequirement,
  discoveryEcho?: DiscoveryEcho,
): Promise<string> {
  const algodUrl = ALGOD_URLS[config.algorandNetwork] ?? ALGOD_URLS.testnet!;
  const algodClient = new algosdk.Algodv2('', algodUrl, '');
  const suggestedParams = await algodClient.getTransactionParams().do();

  const amount = BigInt(requirement.amount ?? requirement.maxAmountRequired);
  const txn = algosdk.makePaymentTxnWithSuggestedParamsFromObject({
    sender: signer.address,
    receiver: requirement.payTo,
    amount,
    suggestedParams,
    note: new TextEncoder().encode(`x402-payment-algo-v${x402Version}-${Date.now()}`),
  });

  const encoded = algosdk.encodeUnsignedTransaction(txn);
  const [signed] = await signer.signTransactions([encoded], [0]);
  if (!signed) throw new Error('Failed to sign ALGO payment transaction');

  return encodePaymentPayload({
    x402Version,
    scheme: requirement.scheme,
    network: requirement.network,
    asset: requirement.asset,
    payload: { paymentGroup: [bytesToBase64(signed)], paymentIndex: 0 },
    ...(discoveryEcho?.extensions ? { extensions: discoveryEcho.extensions } : {}),
    ...(discoveryEcho?.resource ? { resource: discoveryEcho.resource } : {}),
  });
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
  discoveryEcho?: DiscoveryEcho,
): Promise<string> {
  const scheme = new ExactAvmScheme(signer);
  const { payload } = await scheme.createPaymentPayload(x402Version, assertCaip2Requirement(requirement));
  return encodePaymentPayload({
    x402Version,
    scheme: requirement.scheme,
    network: requirement.network,
    asset: requirement.asset,
    payload,
    // Echoed verbatim from the 402 response — see algorand-scheme.ts's sibling
    // implementation in packages/agent-sdk for why both fields are required
    // for the facilitator to catalog the resource in the Bazaar / attribute
    // a challenge tag, confirmed against the live facilitator.
    ...(discoveryEcho?.extensions ? { extensions: discoveryEcho.extensions } : {}),
    ...(discoveryEcho?.resource ? { resource: discoveryEcho.resource } : {}),
  });
}
