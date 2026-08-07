import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

const KEY_PREFIX = 'amk_';

/**
 * Provider control-plane API keys are bearer secrets, not signed tokens —
 * there's no address to recover the way there is for wallet tokens (see
 * wallet-token.ts), so the only thing ever persisted is a SHA-256 hash. The
 * raw key is returned to the caller exactly once, at registration or
 * rotation, and is unrecoverable after that.
 */
export function generateApiKey(): { key: string; hash: string } {
  const key = `${KEY_PREFIX}${randomBytes(24).toString('base64url')}`;
  return { key, hash: hashApiKey(key) };
}

export function hashApiKey(key: string): string {
  return createHash('sha256').update(key).digest('hex');
}

export function verifyApiKey(key: string, hash: string): boolean {
  const provided = Buffer.from(hashApiKey(key), 'hex');
  const expected = Buffer.from(hash, 'hex');
  if (provided.length !== expected.length) return false;
  return timingSafeEqual(provided, expected);
}
