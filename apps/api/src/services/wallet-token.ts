import { createHmac, timingSafeEqual } from 'node:crypto';

const SEPARATOR = '.';

/**
 * Proof that this server verified `address` after a settled payment. Handed
 * to the client once (see the x402 payment middleware) so it can reclaim the
 * wallet rate-limit tier on later requests without re-settling a payment
 * each time. HMAC-signed so it can't be forged for an address the caller
 * doesn't control — Algorand addresses are public on-chain, so trusting a
 * bare self-declared address header would let anyone impersonate any
 * already-verified wallet to steal its higher rate limit.
 */
export function signWalletToken(address: string, secret: string): string {
  const signature = createHmac('sha256', secret).update(address).digest('hex');
  return `${address}${SEPARATOR}${signature}`;
}

/** Returns the address if `token` carries a valid signature for it, otherwise undefined. */
export function verifyWalletToken(token: string, secret: string): string | undefined {
  const separatorIndex = token.lastIndexOf(SEPARATOR);
  if (separatorIndex === -1) return undefined;

  const address = token.slice(0, separatorIndex);
  const signature = token.slice(separatorIndex + 1);
  const expected = createHmac('sha256', secret).update(address).digest('hex');

  let provided: Buffer;
  let wanted: Buffer;
  try {
    provided = Buffer.from(signature, 'hex');
    wanted = Buffer.from(expected, 'hex');
  } catch {
    return undefined;
  }
  if (provided.length !== wanted.length || !timingSafeEqual(provided, wanted)) return undefined;

  return address;
}
