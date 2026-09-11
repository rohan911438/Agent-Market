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
  resource: z.string(),
  description: z.string(),
  mimeType: z.string().default('application/json'),
  payTo: z.string(),
  asset: z.string(),
  maxTimeoutSeconds: z.number().int().positive().default(60),
  extra: z.record(z.string(), z.unknown()).optional(),
});
export type PaymentRequirement = z.infer<typeof PaymentRequirementSchema>;

export const PaymentRequiredResponseSchema = z.object({
  x402Version: z.number().int(),
  error: z.string().optional(),
  accepts: z.array(PaymentRequirementSchema).min(1),
});
export type PaymentRequiredResponse = z.infer<typeof PaymentRequiredResponseSchema>;

/** Decoded contents of the client's X-PAYMENT header. */
export const PaymentPayloadSchema = z.object({
  x402Version: z.number().int(),
  scheme: z.string(),
  network: z.string(),
  payload: z.record(z.string(), z.unknown()),
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
