import { PaymentPayloadSchema, type PaymentPayload } from '@rohankumar4179/shared-types';

/** X-PAYMENT is base64-encoded JSON per the x402 spec. */
export function decodePaymentHeader(header: string): PaymentPayload {
  let json: string;
  try {
    json = Buffer.from(header, 'base64').toString('utf-8');
  } catch {
    throw new Error('X-PAYMENT header is not valid base64');
  }

  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch {
    throw new Error('X-PAYMENT header does not contain valid JSON');
  }

  return PaymentPayloadSchema.parse(raw);
}

export function encodePaymentPayload(payload: PaymentPayload): string {
  return Buffer.from(JSON.stringify(payload), 'utf-8').toString('base64');
}
