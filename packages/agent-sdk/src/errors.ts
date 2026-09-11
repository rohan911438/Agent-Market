/** Base class for every error this SDK throws — lets consumers `catch (e) { if (e instanceof AgentMarketError) ... }` once instead of string-matching messages. */
export class AgentMarketError extends Error {
  constructor(
    message: string,
    readonly code: string,
  ) {
    super(message);
    this.name = 'AgentMarketError';
  }
}

/** A call would push spend past a configured Budget cap — thrown *before* any payment is constructed or sent. */
export class BudgetExceededError extends AgentMarketError {
  constructor(
    readonly limit: 'perCall' | 'session' | 'daily',
    readonly limitUsd: number,
    readonly wouldSpendUsd: number,
    resource: string,
  ) {
    super(
      `Budget exceeded: calling "${resource}" would bring ${limit} spend to $${wouldSpendUsd.toFixed(4)}, over the $${limitUsd.toFixed(4)} cap.`,
      'BUDGET_EXCEEDED',
    );
    this.name = 'BudgetExceededError';
  }
}

/** The server issued payment requirements this client has no scheme for (e.g. a network the configured PaymentScheme doesn't support). */
export class UnsupportedPaymentSchemeError extends AgentMarketError {
  constructor(readonly network: string) {
    super(`No configured payment scheme supports network "${network}".`, 'UNSUPPORTED_PAYMENT_SCHEME');
    this.name = 'UnsupportedPaymentSchemeError';
  }
}

/** Payment was constructed and sent, but the server rejected it (invalid signature, already-settled, etc.) — see `serverCode`/`details` for why. */
export class PaymentFailedError extends AgentMarketError {
  constructor(
    readonly serverCode: string,
    message: string,
    readonly details?: Record<string, unknown>,
  ) {
    super(message, 'PAYMENT_FAILED');
    this.name = 'PaymentFailedError';
  }
}

/** A non-payment HTTP error (validation, not found, rate limited, internal, ...) — see `statusCode`/`serverCode`. */
export class HttpError extends AgentMarketError {
  constructor(
    readonly statusCode: number,
    readonly serverCode: string,
    message: string,
    readonly details?: Record<string, unknown>,
  ) {
    super(message, 'HTTP_ERROR');
    this.name = 'HttpError';
  }
}

/** The primary resource and every configured fallback all failed — `attempts` preserves each one's error in order. */
export class AllProvidersFailedError extends AgentMarketError {
  constructor(readonly attempts: { resource: string; error: Error }[]) {
    const summary = attempts.map((a) => `${a.resource}: ${a.error.message}`).join('; ');
    super(`All ${attempts.length} provider(s) failed — ${summary}`, 'ALL_PROVIDERS_FAILED');
    this.name = 'AllProvidersFailedError';
  }
}
