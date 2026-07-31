import { describe, expect, it } from 'vitest';
import { signWalletToken, verifyWalletToken } from './wallet-token.js';

describe('wallet token', () => {
  it('round-trips a valid token back to its address', () => {
    const token = signWalletToken('ALGO_ADDRESS_A', 'secret-1');
    expect(verifyWalletToken(token, 'secret-1')).toBe('ALGO_ADDRESS_A');
  });

  it('rejects a token signed with a different secret', () => {
    const token = signWalletToken('ALGO_ADDRESS_A', 'secret-1');
    expect(verifyWalletToken(token, 'secret-2')).toBeUndefined();
  });

  it('rejects a forged token claiming a different address than it was signed for', () => {
    const token = signWalletToken('ALGO_ADDRESS_A', 'secret-1');
    const [, signature] = [token.slice(0, token.lastIndexOf('.')), token.slice(token.lastIndexOf('.') + 1)];
    const forged = `ALGO_ADDRESS_B.${signature}`;
    expect(verifyWalletToken(forged, 'secret-1')).toBeUndefined();
  });

  it('rejects malformed tokens without throwing', () => {
    expect(verifyWalletToken('not-a-real-token', 'secret-1')).toBeUndefined();
    expect(verifyWalletToken('address.not-hex!!', 'secret-1')).toBeUndefined();
  });
});
