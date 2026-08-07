import { HttpError, PaymentFailedError } from './errors.js';
import type { RetryConfig } from './types.js';

export const DEFAULT_RETRY: Required<RetryConfig> = {
  maxAttempts: 3,
  baseDelayMs: 250,
  maxDelayMs: 4000,
};

/**
 * Whether a failure is worth retrying at all. Validation-shaped failures
 * (bad symbol, malformed body, publish requirements not met, ...) will fail
 * identically on attempt two — retrying just burns a rate-limit slot and
 * delays surfacing the real problem. Payment and infrastructure failures
 * are usually transient, so those *are* retried.
 */
export function isRetryable(error: unknown): boolean {
  if (error instanceof HttpError) {
    if (error.statusCode === 429) return true; // RATE_LIMITED
    if (error.statusCode >= 500) return true;
    return false; // 4xx other than 429 is a client-side problem, not transient
  }
  if (error instanceof PaymentFailedError) {
    // PAYMENT_ALREADY_SETTLED is the server's own "retry shortly" — a
    // concurrent-request race on the same paymentRef, not a real failure.
    // Everything else (bad signature, insufficient funds, wallet spend cap)
    // will fail identically on a second attempt, so surface it immediately
    // instead of masking it behind a delay.
    return error.serverCode === 'PAYMENT_ALREADY_SETTLED';
  }
  // Network-level failures (fetch throwing, DNS, connection reset) have no HttpError to inspect.
  return true;
}

/** Reads a server-supplied retry hint (Retry-After header or {details:{resetSeconds}}) when present, falling back to exponential backoff otherwise. */
export function delayForAttempt(attempt: number, config: Required<RetryConfig>, error?: unknown): number {
  if (error instanceof HttpError && typeof error.details?.resetSeconds === 'number') {
    return Math.min(error.details.resetSeconds * 1000, config.maxDelayMs);
  }
  const exponential = config.baseDelayMs * 2 ** (attempt - 1);
  const jitter = Math.random() * config.baseDelayMs;
  return Math.min(exponential + jitter, config.maxDelayMs);
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Runs `fn`, retrying on transient failure per `config`. `onRetry` fires
 * before each retry's delay so callers can emit a trace event or log —
 * it never fires on the final, non-retried failure.
 */
export async function withRetry<T>(
  fn: (attempt: number) => Promise<T>,
  config: RetryConfig | undefined,
  onRetry?: (attempt: number, error: unknown, delayMs: number) => void,
): Promise<T> {
  const resolved: Required<RetryConfig> = { ...DEFAULT_RETRY, ...config };
  let lastError: unknown;

  for (let attempt = 1; attempt <= resolved.maxAttempts; attempt++) {
    try {
      return await fn(attempt);
    } catch (error) {
      lastError = error;
      const isLastAttempt = attempt === resolved.maxAttempts;
      if (isLastAttempt || !isRetryable(error)) throw error;

      const delayMs = delayForAttempt(attempt, resolved, error);
      onRetry?.(attempt, error, delayMs);
      await sleep(delayMs);
    }
  }

  // Unreachable — the loop always either returns or throws — but keeps TS happy.
  throw lastError;
}
