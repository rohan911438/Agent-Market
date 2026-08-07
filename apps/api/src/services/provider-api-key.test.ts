import { describe, expect, it } from 'vitest';
import { generateApiKey, hashApiKey, verifyApiKey } from './provider-api-key.js';

describe('provider api key', () => {
  it('generates a key whose hash verifies against itself', () => {
    const { key, hash } = generateApiKey();
    expect(key.startsWith('amk_')).toBe(true);
    expect(verifyApiKey(key, hash)).toBe(true);
  });

  it('rejects a key that does not match the stored hash', () => {
    const { hash } = generateApiKey();
    const { key: otherKey } = generateApiKey();
    expect(verifyApiKey(otherKey, hash)).toBe(false);
  });

  it('never generates the same key twice', () => {
    const a = generateApiKey();
    const b = generateApiKey();
    expect(a.key).not.toBe(b.key);
    expect(a.hash).not.toBe(b.hash);
  });

  it('hashApiKey is deterministic for the same input', () => {
    const { key } = generateApiKey();
    expect(hashApiKey(key)).toBe(hashApiKey(key));
  });
});
