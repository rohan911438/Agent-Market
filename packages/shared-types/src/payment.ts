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

/**
 * The canonical x402 v2 spec's `ResourceInfo` object (specs/x402-specification-v2.md
 * §5.1.2/§5.2.2, coinbase/x402): a REQUIRED top-level field of `PaymentRequired`
 * (and an optional one on `PaymentPayload`) carrying the resource's real,
 * absolute URL. This is the field the GoPlausible facilitator's Bazaar
 * discovery extractor (`extractDiscoveryInfo(paymentPayload, ...)`) actually
 * keys its catalog entries on — confirmed empirically: a real settled
 * MainNet payment with `extensions.bazaar` present but no `resource.url`
 * anywhere in the payload never appeared in the facilitator's
 * `/discovery/resources` catalog. `url` must be absolute (this repo's own
 * `PaymentRequirement.resource` field, by contrast, is deliberately a
 * relative route path used for internal bookkeeping/audit — see that
 * field's own history — and is NOT this object).
 */
export const ResourceInfoSchema = z.object({
  url: z.string(),
  description: z.string().optional(),
  mimeType: z.string().optional(),
});
export type ResourceInfo = z.infer<typeof ResourceInfoSchema>;

/**
 * The x402-avm v2 spec's `accepted` object — the specific PaymentRequirement
 * the client built its payload against, nested inside `PaymentPayload`
 * (never as flat top-level `scheme`/`network` fields, which is what this
 * codebase sent before this field existed). Confirmed against GoPlausible's
 * own published `@x402-avm/core` client source
 * (`x402Client.createPaymentPayload()`): every real client sends
 * `{..., accepted: requirements}`, and `accepted` is a non-optional field on
 * their `PaymentPayloadV2Schema`. A settlement can still succeed without it
 * (this repo's server also sends `paymentRequirements` as a sibling field to
 * the facilitator), but if the facilitator's strict schema validation gates
 * whether its Bazaar-cataloging hook runs, a payload missing `accepted`
 * settles but never catalogs — which matches every real MainNet settlement
 * observed so far.
 */
export const AcceptedRequirementSchema = z.object({
  scheme: z.string(),
  network: z.string(),
  amount: z.string(),
  asset: z.string(),
  payTo: z.string(),
  maxTimeoutSeconds: z.number().int(),
  extra: z.record(z.string(), z.unknown()).optional().nullable(),
});
export type AcceptedRequirement = z.infer<typeof AcceptedRequirementSchema>;

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
  // See ResourceInfoSchema above. Optional here (the spec marks it required)
  // for backward compatibility with any caller built before this field
  // existed; X402PaymentService.buildPaymentRequired always populates it
  // when the route handler supplies an absolute origin.
  resource: ResourceInfoSchema.optional(),
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
  // here unchanged so the facilitator can validate/attach the Bazaar
  // extension. Necessary but NOT sufficient for cataloging on its own — see
  // `resource` below and docs/PAYMENT_FLOW.md's "Bazaar discovery" section
  // for the full, empirically-confirmed story. Without this field,
  // `decodePaymentHeader`'s `.parse()` silently dropped any `extensions` a
  // client sent (zod strips unknown keys by default) before it ever reached
  // the facilitator.
  extensions: z.record(z.string(), z.unknown()).optional(),
  // Verbatim echo of the 402 response's own top-level `resource` object —
  // see ResourceInfoSchema's docstring for why this, not `extensions` alone,
  // is what actually drives Bazaar cataloging.
  resource: ResourceInfoSchema.optional(),
  // See AcceptedRequirementSchema's docstring — the spec-required nested
  // echo of the accepted PaymentRequirement, distinct from this schema's own
  // flat `scheme`/`network`/`asset` fields (kept above for this codebase's
  // own requirement-matching, unrelated to what the facilitator expects).
  accepted: AcceptedRequirementSchema.optional(),
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
