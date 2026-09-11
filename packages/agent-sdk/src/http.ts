import type { PaymentRequiredResponse } from '@rohankumar4179/shared-types';
import { HttpError, PaymentFailedError } from './errors.js';
import type { CallParams } from './types.js';

export function buildUrl(baseUrl: string, resource: string, params?: CallParams): string {
  const base = resource.startsWith('http') ? resource : `${baseUrl}${resource.startsWith('/') ? '' : '/'}${resource}`;
  const url = new URL(base);
  if (params) {
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined) url.searchParams.set(key, String(value));
    }
  }
  return url.toString();
}

interface RawErrorBody {
  error?: { code?: string; message?: string; details?: Record<string, unknown> };
}

/** Codes the payment gate itself raises (see apps/api/src/middleware/x402-payment.ts) — as distinct from a plain validation/not-found/rate-limit failure. */
const PAYMENT_ERROR_CODES = new Set([
  'PAYMENT_INVALID',
  'PAYMENT_VERIFICATION_FAILED',
  'PAYMENT_ALREADY_SETTLED',
  'BUDGET_EXCEEDED',
]);

/** Reads a non-2xx, non-402 response body and throws the appropriately-typed error. Always throws — return type is `never` so callers can `return readError(res)` from a function that otherwise returns a value. */
export async function readError(res: Response): Promise<never> {
  const body = (await res.json().catch(() => ({}))) as RawErrorBody;
  const code = body.error?.code ?? 'UNKNOWN_ERROR';
  const message = body.error?.message ?? `Request failed with HTTP ${res.status}`;

  if (PAYMENT_ERROR_CODES.has(code)) {
    throw new PaymentFailedError(code, message, body.error?.details);
  }
  throw new HttpError(res.status, code, message, body.error?.details);
}

export async function readPaymentRequired(res: Response): Promise<PaymentRequiredResponse> {
  return (await res.json()) as PaymentRequiredResponse;
}
