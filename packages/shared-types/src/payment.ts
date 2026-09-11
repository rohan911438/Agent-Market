import { z } from 'zod';

/**
 * Provider-agnostic x402 shapes. Field names follow the public x402 spec
 * (x402.org) so any compliant client/facilitator can interoperate; the
 * `extra` bag carries scheme/network-specific data (e.g. Algorand asset id)
 * without leaking it into the core contract.
 */
export const PaymentRequirementSchema = z.object({
  scheme: z.string(),
  network: z.string(),
  maxAmountRequired: z.string(),
  // Mirrors maxAmountRequired under the field name x402 v2 facilitators
  // (and their AVM "exact" scheme clients) read the required atomic amount
  // from. Populated alongside maxAmountRequired rather than replacing it, so
  // existing v1-style call sites (spend-cap math, DB bookkeeping) are
  // unaffected.
  amount: z.string().optional(),
  resource: z.string(),
  description: z.string(),
  mimeType: z.string().default('application/json'),
  payTo: z.string(),
  asset: z.string(),
  maxTimeoutSeconds: z.number().int().positive().default(60),
  extra: z.record(z.string(), z.unknown()).optional(),
  // V1 Bazaar discovery descriptor. x402 facilitators that support the
  // discovery ("Bazaar") extension read this straight off the
  // PaymentRequirements they receive at /verify and /settle — no client
  // cooperation required — and catalog the resource after its first real
  // settlement. Shape: `{ input: { type: "http", method, discoverable?,
  // queryParams?|body?+bodyType? }, output?: <example response> }`.
  // Left unconstrained here since the facilitator, not this contract, owns
  // its schema. See @x402-avm/extensions' extractDiscoveryInfoV1.
  outputSchema: z.record(z.string(), z.unknown()).optional(),
});
export type PaymentRequirement = z.infer<typeof PaymentRequirementSchema>;

export const PaymentRequiredResponseSchema = z.object({
  x402Version: z.number().int(),
  error: z.string().optional(),
  accepts: z.array(PaymentRequirementSchema).min(1),
  // x402 v2 extension bag echoed on the 402 body — e.g. `{ bazaar: { info,
  // schema } }` from declareDiscoveryExtension() and an optional
  // `"x402-merchant"` identity block. Spec-compliant clients copy this into
  // the PaymentPayload so the facilitator can catalog the resource; the V1
  // `PaymentRequirement.outputSchema` path above is the client-independent
  // fallback. Unconstrained for the same reason as outputSchema.
  extensions: z.record(z.string(), z.unknown()).optional(),
});
export type PaymentRequiredResponse = z.infer<typeof PaymentRequiredResponseSchema>;

/** Decoded contents of the client's X-PAYMENT header. */
export const PaymentPayloadSchema = z.object({
  x402Version: z.number().int(),
  scheme: z.string(),
  network: z.string(),
  // Which of the 402 response's accepts[] entries this payload was built
  // against — scheme+network alone can be identical across entries (e.g. two
  // Algorand "exact" requirements, one in USDC one in native ALGO), so this
  // is how the server picks the matching PaymentRequirement to verify/settle
  // against. Optional and defaults to accepts[0] for older clients built
  // before a provider ever offered more than one requirement.
  asset: z.string().optional(),
  payload: z.record(z.string(), z.unknown()),
  // Verbatim echo of the 402 response's own `extensions` bag (see
  // PaymentRequiredResponseSchema above) — a spec-compliant client copies it
  // here unchanged so the facilitator can catalog the resource in the Bazaar
  // and attribute a challenge tag on /verify + /settle (see
  // docs/PAYMENT_FLOW.md's "Bazaar discovery" section). Without this field,
  // `decodePaymentHeader`'s `.parse()` silently dropped any `extensions` a
  // client sent (zod strips unknown keys by default) before it ever reached
  // the facilitator — confirmed empirically: a real settled mainnet payment
  // showed up on the facilitator's leaderboard with `bazaar:false,
  // challenge:false` until this field (plus the client-side echo in
  // agent-sdk/algorand-scheme.ts, x402-client.ts, and demo-payment.mjs) was
  // added.
  extensions: z.record(z.string(), z.unknown()).optional(),
});
export type PaymentPayload = z.infer<typeof PaymentPayloadSchema>;

export const PaymentVerifyResultSchema = z.object({
  isValid: z.boolean(),
  invalidReason: z.string().optional(),
  payerAddress: z.string().optional(),
  paymentRef: z.string().optional(),
});
export type PaymentVerifyResult = z.infer<typeof PaymentVerifyResultSchema>;

export const PaymentSettleResultSchema = z.object({
  success: z.boolean(),
  transactionId: z.string().optional(),
  network: z.string(),
  errorReason: z.string().optional(),
});
export type PaymentSettleResult = z.infer<typeof PaymentSettleResultSchema>;
