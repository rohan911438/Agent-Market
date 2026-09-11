import { describe, expect, it, vi } from 'vitest';
import { HttpError, PaymentFailedError } from './errors.js';
import { isRetryable, withRetry } from './retry.js';

describe('isRetryable', () => {
  it('retries a 429 rate limit', () => {
    expect(isRetryable(new HttpError(429, 'RATE_LIMITED', 'slow down'))).toBe(true);
  });

  it('retries a 5xx', () => {
    expect(isRetryable(new HttpError(503, 'INTERNAL_ERROR', 'oops'))).toBe(true);
  });

  it('does not retry a 400 validation error', () => {
    expect(isRetryable(new HttpError(400, 'VALIDATION_ERROR', 'bad symbol'))).toBe(false);
  });

  it('does not retry a 404', () => {
    expect(isRetryable(new HttpError(404, 'NOT_FOUND', 'nope'))).toBe(false);
  });

  it('retries PAYMENT_ALREADY_SETTLED (the server\'s own "retry shortly" race)', () => {
    expect(isRetryable(new PaymentFailedError('PAYMENT_ALREADY_SETTLED', 'retry shortly'))).toBe(true);
  });

  it('does not retry a rejected payment signature', () => {
    expect(isRetryable(new PaymentFailedError('PAYMENT_VERIFICATION_FAILED', 'bad signature'))).toBe(false);
  });

  it('retries a bare network error (no HttpError to inspect)', () => {
    expect(isRetryable(new TypeError('fetch failed'))).toBe(true);
  });
});

describe('withRetry', () => {
  it('returns the result on first success without retrying', async () => {
    const fn = vi.fn().mockResolvedValue('ok');
    const result = await withRetry(fn, { maxAttempts: 3, baseDelayMs: 1 });
    expect(result).toBe('ok');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('retries a transient failure and eventually succeeds', async () => {
    const fn = vi
      .fn()
      .mockRejectedValueOnce(new HttpError(500, 'INTERNAL_ERROR', 'flaky'))
      .mockResolvedValueOnce('ok');
    const result = await withRetry(fn, { maxAttempts: 3, baseDelayMs: 1 });
    expect(result).toBe('ok');
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('gives up after maxAttempts and throws the last error', async () => {
    const fn = vi.fn().mockRejectedValue(new HttpError(500, 'INTERNAL_ERROR', 'always fails'));
    await expect(withRetry(fn, { maxAttempts: 2, baseDelayMs: 1 })).rejects.toThrow('always fails');
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('does not retry a non-retryable error even with attempts remaining', async () => {
    const fn = vi.fn().mockRejectedValue(new HttpError(400, 'VALIDATION_ERROR', 'bad input'));
    await expect(withRetry(fn, { maxAttempts: 5, baseDelayMs: 1 })).rejects.toThrow('bad input');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('calls onRetry before each retry, but never after the final failure', async () => {
    const fn = vi.fn().mockRejectedValue(new HttpError(500, 'INTERNAL_ERROR', 'nope'));
    const onRetry = vi.fn();
    await expect(withRetry(fn, { maxAttempts: 3, baseDelayMs: 1 }, onRetry)).rejects.toThrow();
    expect(onRetry).toHaveBeenCalledTimes(2); // fires before retry 2 and retry 3, not after the 3rd failure
  });
});
