import type { PaymentPayload, PaymentRequirement } from '@rohankumar4179/shared-types';
import type { Budget } from './budget.js';

/** USDC (and this SDK's mock currency) both use 6 decimal places — see AlgorandX402Provider/MockPaymentProvider on the server. */
export const ATOMIC_UNITS_PER_USD = 1_000_000;

/**
 * Builds the signed (or mock) X-PAYMENT payload for one accepted requirement.
 * MockPaymentScheme and AlgorandPaymentScheme both implement this — the
 * client never branches on payment method, it just asks whichever scheme
 * matches the requirement's network to produce a payload.
 */
export interface PaymentScheme {
  /** Whether this scheme can pay a requirement advertising this network (e.g. "mock", or an Algorand CAIP-2 id). */
  supports(network: string): boolean;
  /** `x402Version` is the server's declared protocol version from the 402 response — echo it back in the payload rather than assuming a fixed value. */
  createPayload(requirement: PaymentRequirement, x402Version: number): Promise<PaymentPayload>;
}

export interface BudgetConfig {
  /** Reject any single call priced above this. */
  perCallUsd?: number;
  /** Reject a call that would push cumulative session spend above this. */
  sessionUsd?: number;
  /** Reject a call that would push cumulative spend *today* (UTC) above this. */
  dailyUsd?: number;
}

export interface RetryConfig {
  /** Total attempts including the first — 1 means "no retries." @default 3 */
  maxAttempts?: number;
  /** Base delay before the first retry; doubles each subsequent attempt. @default 250 */
  baseDelayMs?: number;
  /** Ceiling on the backoff delay regardless of attempt count. @default 4000 */
  maxDelayMs?: number;
}

/** Lightweight structured event stream — wire `onEvent` to your own tracer/logger. Not a full OpenTelemetry integration, just the hook points one needs. */
export type AgentEvent =
  | { type: 'call:start'; resource: string; sessionId: string; callId: string }
  | { type: 'call:cost_known'; resource: string; callId: string; priceUsd: number }
  | { type: 'call:paying'; resource: string; callId: string; priceUsd: number }
  | { type: 'call:retry'; resource: string; callId: string; attempt: number; reason: string }
  | { type: 'call:fallback'; fromResource: string; toResource: string; callId: string; reason: string }
  | { type: 'call:success'; resource: string; callId: string; priceUsd: number; latencyMs: number; cacheHit: boolean }
  | { type: 'call:error'; resource: string; callId: string; error: string };

export type AgentEventListener = (event: AgentEvent) => void;

export interface AgentMarketClientConfig {
  /** Base URL of the AgentMarket API. @default "http://localhost:4000" */
  baseUrl?: string;
  /** How payments get signed. Use `createMockPaymentScheme()` for local dev, `createAlgorandPaymentScheme(...)` for real settlement. */
  paymentScheme: PaymentScheme;
  /**
   * Spend limits. Pass the *same* `Budget` instance to multiple clients (see
   * `createSharedBudget`) to cap what a swarm of agents spends in total,
   * not just what each one spends individually.
   */
  budget?: BudgetConfig | Budget;
  retry?: RetryConfig;
  /** Correlates every call made by this client under one id — see AgentContext. */
  sessionId?: string;
  onEvent?: AgentEventListener;
  /** Response cache for identical (resource + params) calls. Off by default. */
  cacheTtlMs?: number;
  /** Override fetch (tests, custom networking). @default globalThis.fetch */
  fetchImpl?: typeof fetch;
}

export interface CallParams {
  [key: string]: string | number | boolean | undefined;
}

export interface CallOptions {
  method?: 'GET' | 'POST';
  body?: unknown;
  /** Per-call override of the client's default retry policy. */
  retry?: RetryConfig;
  /** Skip the response cache for this call even if cacheTtlMs is configured. */
  noCache?: boolean;
}

export interface CostEstimate {
  resource: string;
  priceUsd: number;
  network: string;
  scheme: string;
}

export interface UsageRecord {
  resource: string;
  priceUsd: number;
  cacheHit: boolean;
  success: boolean;
  timestamp: string;
  latencyMs: number;
}

export interface UsageSummary {
  totalCalls: number;
  totalSpendUsd: number;
  byResource: Record<string, { calls: number; spendUsd: number }>;
}

export interface MarketplaceListing {
  id: string;
  slug: string;
  name: string;
  description: string;
  category: string;
  priceUsd: number;
  endpoint: string;
  status: string;
  providerName?: string;
  isThirdParty?: boolean;
}

export interface DiscoverQuery {
  category?: string;
  maxPriceUsd?: number;
  /** Case-insensitive substring match against name + description. */
  search?: string;
}

/**
 * State a job in natural language instead of constructing a keyword query —
 * `agent.findCapability({ task, constraints })`, wrapping POST /v1/discover
 * (Phase 11). See apps/api/src/services/discovery-ranking.ts for the
 * documented, inspectable scoring formula behind the ranking.
 */
export interface CapabilitySearchQuery {
  task: string;
  constraints?: {
    maxLatencyMs?: number;
    maxCostPerCall?: number;
  };
}

export interface CapabilitySearchResult {
  listing: MarketplaceListing;
  /** Higher is a better match — see discovery-ranking.ts for the exact formula. */
  score: number;
  /** Why this listing scored the way it did (e.g. "matches keywords: wallet, risk", "provider trust score: 80/100") — never a bare unexplained number. */
  reasons: string[];
}
