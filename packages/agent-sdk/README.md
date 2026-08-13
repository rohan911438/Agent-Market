# @rohankumar4179/agent-sdk

The demand side of AgentMarket, packaged as code. Give an autonomous agent a wallet and this client, and it can discover, price, pay for, and call any metered endpoint on the marketplace — with budgets, retries, and fallbacks handled for it.

```ts
import { AgentMarketClient, createMockPaymentScheme } from '@rohankumar4179/agent-sdk';

const agent = new AgentMarketClient({
  baseUrl: 'https://api.agentmarket.dev',
  paymentScheme: createMockPaymentScheme(), // swap for createAlgorandPaymentScheme(...) in production
  budget: { perCallUsd: 0.10, dailyUsd: 5 },
});

const risk = await agent
  .call('/v1/risk-analysis', { symbol: 'BTC' })
  .fallback('/v1/portfolio-health')
  .withRetries(3);
```

No API key. No subscription. The 402 → pay → 200 loop runs inside `.call()`; you never see an `X-PAYMENT` header unless you go looking for one.

## Install

Inside this monorepo:

```bash
npm install --workspace=@rohankumar4179/agent-sdk
```

## Quickstart

### 1. Pick a payment scheme

**Local dev / CI** — pairs with an AgentMarket server running `PAYMENT_PROVIDER=mock`. No funds, no network calls to a facilitator:

```ts
import { createMockPaymentScheme } from '@rohankumar4179/agent-sdk';
const paymentScheme = createMockPaymentScheme();
```

**Real settlement** — signs and pays with an actual Algorand account. Needs network access to an Algod node (defaults to AlgoNode's public endpoint) and a funded TestNet/MainNet account:

```ts
import { createAlgorandPaymentScheme } from '@rohankumar4179/agent-sdk';
const paymentScheme = createAlgorandPaymentScheme({ mnemonic: process.env.AGENT_MNEMONIC! });
```

An unfunded account fails loudly (a `PaymentFailedError` or a thrown error from the underlying `@x402-avm/avm` transaction builder) rather than silently — there's no way to "test" real settlement without funds, so don't expect a dry-run mode here.

### 2. Construct the client

```ts
const agent = new AgentMarketClient({
  baseUrl: 'http://localhost:4000',   // default
  paymentScheme,
  budget: { perCallUsd: 0.05, sessionUsd: 2, dailyUsd: 10 }, // any subset; all optional
  retry: { maxAttempts: 3 },          // default
  onEvent: (e) => console.log(e),     // optional — see "Events" below
});
```

### 3. Call something

```ts
const sentiment = await agent.call<{ score: number; label: string }>('/v1/sentiment');
```

`.call()` returns a `PendingCall` — nothing happens over the network until you `await` it (or chain `.fallback()` / `.withRetries()` first).

## What it actually does for you

| Feature | How |
|---|---|
| **Automatic payment** | On a 402, reads the real price from the server's response, builds and signs the payment via your configured `PaymentScheme`, retries the request with `X-PAYMENT` set. |
| **Budget limits** | `perCallUsd` / `sessionUsd` / `dailyUsd`. Checked *before* a payment is constructed — a call over budget never touches the network for payment. Pass the same `Budget` instance (via `createSharedBudget`) to multiple clients to cap what a swarm spends in total. |
| **Cost estimation** | `agent.estimateCost(resource)` reads the price straight off the 402 response, without paying. |
| **Smart retries** | Retries 5xx, 429 (respecting a `Retry-After`-style hint), and network errors. Does **not** retry 4xx validation failures or a rejected payment signature — those fail identically twice, so retrying just delays the real error. `PAYMENT_ALREADY_SETTLED` (a concurrent-request race, not a real failure) *is* retried. |
| **Fallback APIs** | `.call(primary).fallback(secondary).fallback(tertiary)` — tries each in order, stops at the first success. |
| **Provider selection** | `agent.discover({ category, maxPriceUsd, search })` filters the public catalog (`/v1/marketplace`) and sorts by price. Simple filtering, not semantic ranking. |
| **AI Discovery** | `agent.findCapability({ task, constraints })` states a job in natural language instead of a keyword query — ranks the catalog by relevance (TF-IDF), provider trust, and constraint fit (`maxLatencyMs`, `maxCostPerCall`), returning each result with a `score` and `reasons` explaining why it ranked where it did. See `apps/api/src/services/discovery-ranking.ts` for the documented formula. |
| **Usage tracking** | `agent.getUsageSummary()` — total calls, total spend, broken down per resource. Local to this process; not a replacement for the server's own dashboard. |
| **Response caching** | `cacheTtlMs` on the client, or `noCache: true` per call to bypass it. Off by default. |
| **Multi-agent coordination** | `createSharedBudget(config)` — one `Budget`, many `AgentMarketClient`s. |
| **Context propagation** | Every client has a `sessionId` (`agent.getSessionId()`); every call gets a `callId` that stays constant across a `.call().fallback()` chain, both surfaced through the event stream. |
| **Structured errors** | `AgentMarketError` subclasses — see below — instead of parsing message strings. |

Not implemented, on purpose: streaming (nothing in the current API streams), and full OpenTelemetry integration (the `onEvent` hook is designed to be wired into one, not a replacement for one).

## Fallbacks

```ts
const result = await agent
  .call('/v1/risk-analysis', { symbol: 'BTC' })
  .fallback('/v1/portfolio-health', { holdings: [...] })
  .fallback('/v1/analyze', { symbol: 'BTC' });
```

Each resource is tried with the client's full retry policy before moving to the next. If every resource fails, the rejection is an `AllProvidersFailedError` carrying every attempt's resource and error in order. If there's no fallback configured at all, a failure surfaces as its original type — `catch (e) { if (e instanceof BudgetExceededError) ... }` works whether or not you ever add a `.fallback()`.

## Errors

```
AgentMarketError                    (base — catch this to catch everything below)
├── BudgetExceededError             limit: 'perCall' | 'session' | 'daily'
├── UnsupportedPaymentSchemeError   network: string
├── PaymentFailedError              serverCode: string (e.g. PAYMENT_VERIFICATION_FAILED)
├── HttpError                       statusCode: number, serverCode: string
└── AllProvidersFailedError         attempts: { resource, error }[]
```

```ts
try {
  await agent.call('/v1/analyze', { symbol: 'BTC' });
} catch (err) {
  if (err instanceof BudgetExceededError) {
    console.warn(`Skipping — would cost more than the ${err.limit} cap allows.`);
  } else {
    throw err;
  }
}
```

## Events

`onEvent` fires a typed event for every meaningful step of a call — wire it into your own logger or tracer:

```
call:start        -> call:cost_known -> call:paying -> call:success
                                                     \-> call:retry (0+)
                                                     \-> call:fallback -> call:start (next resource)
                                                     \-> call:error
```

```ts
const agent = new AgentMarketClient({
  paymentScheme,
  onEvent: (e) => tracer.addEvent(e.type, e), // e.g. wire into OpenTelemetry yourself
});
```

## Discovery

```ts
const cheap = await agent.discover({ category: 'Financial Intelligence', maxPriceUsd: 0.03 });
// -> sorted by price ascending
```

## AI Discovery

```ts
const results = await agent.findCapability({
  task: 'flag wallets with elevated risk before a payout',
  constraints: { maxCostPerCall: 0.05 },
});
// -> ranked best-to-worst; each result carries `score` and `reasons`
const best = results[0];
console.log(best.listing.name, best.score, best.reasons);
```

## Development

```bash
npm run build --workspace=@rohankumar4179/agent-sdk
npm run test --workspace=@rohankumar4179/agent-sdk
npm run lint --workspace=@rohankumar4179/agent-sdk
```

Tests run against `src/test-helpers/fake-server.ts`, a `fetch`-compatible fake that implements the same 402/`X-PAYMENT` contract the real server does — no live server needed. The orchestration logic (retries, budgets, fallbacks, caching, events) is exercised there directly; `AlgorandPaymentScheme`'s actual transaction signing is delegated to `@x402-avm/avm` and isn't re-tested here.
