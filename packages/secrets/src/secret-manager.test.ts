import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { SecretManager, SecretValidationError, redactSecrets } from './secret-manager.js';

const schema = z.object({
  API_KEY: z.string().min(1),
  OPTIONAL_FLAG: z.string().optional(),
});

describe('SecretManager', () => {
  it('parses a valid source and exposes typed getters', () => {
    const manager = new SecretManager(schema, { API_KEY: 'abc123' });
    expect(manager.getRequired('API_KEY')).toBe('abc123');
    expect(manager.getOptional('OPTIONAL_FLAG')).toBeUndefined();
    expect(manager.has('OPTIONAL_FLAG')).toBe(false);
  });

  it('throws SecretValidationError without leaking values on invalid source', () => {
    let error: unknown;
    try {
      new SecretManager(schema, {});
    } catch (err) {
      error = err;
    }
    expect(error).toBeInstanceOf(SecretValidationError);
    expect((error as Error).message).toContain('API_KEY');
    expect((error as Error).message).not.toContain('abc123');
  });

  it('throws when getRequired is called on an unset value', () => {
    const manager = new SecretManager(schema, { API_KEY: 'abc123' });
    expect(() => manager.getRequired('OPTIONAL_FLAG')).toThrow(SecretValidationError);
  });

  it('never includes raw secret values in describeKeys', () => {
    const manager = new SecretManager(schema, { API_KEY: 'super-secret-value' });
    const keys = manager.describeKeys();
    expect(keys).toContain('API_KEY');
    expect(keys.join(',')).not.toContain('super-secret-value');
  });
});

describe('redactSecrets', () => {
  it('redacts keys that look secret-shaped, recursively', () => {
    const result = redactSecrets({
      apiKey: 'sk-live-123',
      nested: { authToken: 'tok_abc', safe: 'ok' },
      list: [{ password: 'hunter2' }],
      plain: 'unchanged',
    }) as Record<string, unknown>;

    expect(result.apiKey).toBe('[REDACTED]');
    expect((result.nested as Record<string, unknown>).authToken).toBe('[REDACTED]');
    expect((result.nested as Record<string, unknown>).safe).toBe('ok');
    expect(((result.list as Record<string, unknown>[])[0] as Record<string, unknown>).password).toBe(
      '[REDACTED]',
    );
    expect(result.plain).toBe('unchanged');
  });
});
