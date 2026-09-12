import { randomUUID } from 'node:crypto';
import type { PaymentRequiredResponse } from '@rohankumar4179/shared-types';
import { Budget } from './budget.js';
import { searchCapabilities } from './capability-search.js';
import { estimateCost } from './cost-estimator.js';
import { discoverListings } from './discovery.js';
import { AllProvidersFailedError, HttpError, UnsupportedPaymentSchemeError } from './errors.js';
import { buildUrl, readError } from './http.js';
import { withRetry } from './retry.js';
import { ATOMIC_UNITS_PER_USD } from './types.js';
import { UsageTracker } from './usage-tracker.js';
import type {
  AgentEvent,
  AgentMarketClientConfig,
  CallOptions,
  CallParams,
  CapabilitySearchQuery,
  CapabilitySearchResult,
  CostEstimate,
  DiscoverQuery,
  MarketplaceListing,
  UsageSummary,
} from './types.js';

interface CacheEntry {
  expiresAt: number;
  body: unknown;
}

interface FallbackSpec {
  resource: string;
  params?: CallParams;
}

interface AttemptResult<T> {
  body: T;
  priceUsd: number;
}

function cacheKeyFor(resource: string, params?: CallParams): string {
  return `${resource}?${JSON.stringify(params ?? {})}`;
}

/**
 * A call in progress. Thenable — `await client.call(...)`, with or without
 * `.fallback()`/`.withRetries()` chained first, runs the whole thing; there
 * is no separate `.execute()` to remember to call.
 */
export class PendingCall<T = unknown> implements PromiseLike<T> {
  private readonly fallbacks: FallbackSpec[] = [];
  private readonly callId = randomUUID();
  private retryOverride: CallOptions['retry'];

  constructor(
    private readonly client: AgentMarketClient,
    private readonly resource: string,
    private readonly params: CallParams | undefined,
    private readonly options: CallOptions,
  ) {}

  /** Try `resource` next if the primary (and every earlier fallback) fails. Chainable for a longer chain, tried in the order added. */
  fallback(resource: string, params?: CallParams): this {
    this.fallbacks.push({ resource, params });
    return this;
  }

  /** Overrides the client/call-level retry policy's attempt count for this call specifically. */
  withRetries(maxAttempts: number): this {
    this.retryOverride = { ...this.options.retry, maxAttempts };
    return this;
  }

  private async execute(): Promise<T> {
    const chain: FallbackSpec[] = [{ resource: this.resource, params: this.params }, ...this.fallbacks];
    const attempts: { resource: string; error: Error }[] = [];

    for (let i = 0; i < chain.length; i++) {
      const spec = chain[i]!;
      try {
        return await this.client.executeCall<T>(
          spec.resource,
          spec.params,
          { ...this.options, retry: this.retryOverride ?? this.options.retry },
          this.callId,
        );
      } catch (error) {
        attempts.push({ resource: spec.resource, error: error as Error });
        const next = chain[i + 1];
        if (!next) break;
        this.client.emitEvent({
          type: 'call:fallback',
          fromResource: spec.resource,
          toResource: next.resource,
          callId: this.callId,
          reason: (error as Error).message,
        });
      }
    }

    // No fallback was configured at all — surface the original error as-is
    // (a BudgetExceededError should still be catchable as one) rather than
    // always wrapping a single failure in a "providers" error that implies
    // more than one resource was tried.
    if (attempts.length === 1) throw attempts[0]!.error;
    throw new AllProvidersFailedError(attempts);
  }

  then<TResult1 = T, TResult2 = never>(
    onfulfilled?: ((value: T) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): PromiseLike<TResult1 | TResult2> {
    return this.execute().then(onfulfilled, onrejected);
  }
}

/**
 * The demand side of the marketplace, packaged as code. One client per
 * agent identity/wallet — construct it once, keep calling `.call()`.
 *
 * ```ts
 * const agent = new AgentMarketClient({ paymentScheme: createMockPaymentScheme() });
 * const risk = await agent.call('/v1/risk-analysis', { symbol: 'BTC' }).fallback('/v1/portfolio-health');
 * ```
 */
export class AgentMarketClient {
  readonly usage = new UsageTracker();
  private readonly budget?: Budget;
  private readonly cache = new Map<string, CacheEntry>();
  private readonly sessionId: string;
  private readonly fetchImpl: typeof fetch;
  private readonly baseUrl: string;

  constructor(private readonly config: AgentMarketClientConfig) {
    this.baseUrl = (config.baseUrl ?? 'http://localhost:4000').replace(/\/$/, '');
    this.fetchImpl = config.fetchImpl ?? fetch;
    this.sessionId = config.sessionId ?? randomUUID();
    this.budget = config.budget instanceof Budget ? config.budget : config.budget ? new Budget(config.budget) : undefined;
  }

  /** Correlates every call this client makes — see AgentEvent's `sessionId`. Pass the same value via `sessionId` in the constructor to continue a session across client instances. */
  getSessionId(): string {
    return this.sessionId;
  }

  /** Starts a call. Nothing happens until you `await` it (optionally after chaining `.fallback()`/`.withRetries()`). */
  call<T = unknown>(resource: string, params?: CallParams, options: CallOptions = {}): PendingCall<T> {
    return new PendingCall<T>(this, resource, params, options);
  }

  /** Prices a resource without paying for it — see cost-estimator.ts. */
  estimateCost(resource: string, params?: CallParams): Promise<CostEstimate> {
    return estimateCost(this.fetchImpl, this.baseUrl, resource, params);
  }

  /** Filters the public catalog — see discovery.ts. */
  discover(query?: DiscoverQuery): Promise<MarketplaceListing[]> {
    return discoverListings(this.fetchImpl, this.baseUrl, query);
  }

  /** Ranked discovery against a free-text task description — see capability-search.ts. */
  findCapability(query: CapabilitySearchQuery): Promise<CapabilitySearchResult[]> {
    return searchCapabilities(this.fetchImpl, this.baseUrl, query);
  }

  getUsageSummary(): UsageSummary {
    return this.usage.summary();
  }

  /** @internal Called by PendingCall — not part of the supported per-call API surface. */
  emitEvent(event: AgentEvent): void {
    this.config.onEvent?.(event);
  }

  /** @internal Called by PendingCall. */
  async executeCall<T>(resource: string, params: CallParams | undefined, options: CallOptions, callId: string): Promise<T> {
    const cacheKey = this.config.cacheTtlMs && !options.noCache ? cacheKeyFor(resource, params) : undefined;
    if (cacheKey) {
      const cached = this.cache.get(cacheKey);
      if (cached && cached.expiresAt > Date.now()) {
        this.usage.record({ resource, priceUsd: 0, cacheHit: true, success: true, timestamp: new Date().toISOString(), latencyMs: 0 });
        this.emitEvent({ type: 'call:success', resource, callId, priceUsd: 0, latencyMs: 0, cacheHit: true });
        return cached.body as T;
      }
    }

    this.emitEvent({ type: 'call:start', resource, sessionId: this.sessionId, callId });
    const start = Date.now();

    try {
      const { body, priceUsd } = await withRetry(
        () => this.attemptCall<T>(resource, params, options, callId),
        options.retry ?? this.config.retry,
        (attempt, error, _delayMs) => {
          this.emitEvent({ type: 'call:retry', resource, callId, attempt, reason: (error as Error).message });
        },
      );

      const latencyMs = Date.now() - start;
      this.usage.record({ resource, priceUsd, cacheHit: false, success: true, timestamp: new Date().toISOString(), latencyMs });
      this.emitEvent({ type: 'call:success', resource, callId, priceUsd, latencyMs, cacheHit: false });

      if (cacheKey && this.config.cacheTtlMs) {
        this.cache.set(cacheKey, { body, expiresAt: Date.now() + this.config.cacheTtlMs });
      }
      return body;
    } catch (error) {
      this.emitEvent({ type: 'call:error', resource, callId, error: (error as Error).message });
      throw error;
    }
  }

  private async attemptCall<T>(
    resource: string,
    params: CallParams | undefined,
    options: CallOptions,
    callId: string,
  ): Promise<AttemptResult<T>> {
    const url = buildUrl(this.baseUrl, resource, params);
    const method = options.method ?? (options.body !== undefined ? 'POST' : 'GET');
    const jsonHeaders = options.body !== undefined ? { 'content-type': 'application/json' } : undefined;
    const jsonBody = options.body !== undefined ? JSON.stringify(options.body) : undefined;

    const initial = await this.fetchImpl(url, { method, headers: jsonHeaders, body: jsonBody });

    if (initial.status !== 402) {
      if (!initial.ok) return readError(initial);
      return { body: (await initial.json()) as T, priceUsd: 0 };
    }

    const paymentRequired = (await initial.json()) as PaymentRequiredResponse;
    const requirement = paymentRequired.accepts[0];
    if (!requirement) {
      throw new HttpError(402, 'PAYMENT_REQUIRED', `Server returned 402 for "${resource}" with no payment options.`);
    }

    const priceUsd = Number(requirement.amount ?? requirement.maxAmountRequired) / ATOMIC_UNITS_PER_USD;
    this.emitEvent({ type: 'call:cost_known', resource, callId, priceUsd });

    // Checked, not recorded, here — `record` happens only after the paid
    // request actually succeeds, so a failed/retried payment never eats
    // budget it didn't spend.
    this.budget?.check(resource, priceUsd);

    if (!this.config.paymentScheme.supports(requirement.network)) {
      throw new UnsupportedPaymentSchemeError(requirement.network);
    }

    this.emitEvent({ type: 'call:paying', resource, callId, priceUsd });
    const payload = await this.config.paymentScheme.createPayload(requirement, paymentRequired.x402Version, {
      extensions: paymentRequired.extensions,
      resource: paymentRequired.resource,
    });
    const paymentHeader = Buffer.from(JSON.stringify(payload)).toString('base64');

    const paidRes = await this.fetchImpl(url, {
      method,
      headers: { 'x-payment': paymentHeader, ...jsonHeaders },
      body: jsonBody,
    });

    if (!paidRes.ok) return readError(paidRes);

    this.budget?.record(priceUsd);
    return { body: (await paidRes.json()) as T, priceUsd };
  }
}
