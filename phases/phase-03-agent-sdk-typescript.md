# Phase 03 — Agent SDK (TypeScript) ✅ Done

## What shipped

`packages/agent-sdk` (`@rohankumar4179/agent-sdk`) — the demand-side client. `AgentMarketClient` runs the 402 → pay → 200 loop automatically behind a fluent, thenable `.call()` API:

```ts
const agent = new AgentMarketClient({ paymentScheme: createMockPaymentScheme(), budget: { perCallUsd: 0.1 } });
const risk = await agent.call('/v1/risk-analysis', { symbol: 'BTC' }).fallback('/v1/portfolio-health');
```

Pluggable payment schemes (`createMockPaymentScheme()` for dev, `createAlgorandPaymentScheme()` for real settlement via `@x402-avm/avm`), shareable budgets (`createSharedBudget`), retries that only retry what's actually transient, fallback chains, cost estimation, catalog discovery/filtering, usage tracking, and a structured event stream.

## Where it lives

Everything under `packages/agent-sdk/src/`. See `packages/agent-sdk/README.md` for the full feature table and API reference — it's kept current, read it rather than this file for usage details.

## Decisions worth knowing before extending this

- **The SDK depends on `@rohankumar4179/shared-types` for wire types.** That's fine inside this monorepo; if this package is ever actually published to npm standalone, that dependency needs resolving first (either publish shared-types too, or fork the ~5 types the SDK actually uses).
- **`AlgorandPaymentScheme` delegates all transaction signing to `@x402-avm/avm`'s `ExactAvmScheme`/`toClientAvmSigner`** rather than reimplementing Algorand atomic-group construction. Don't hand-roll transaction building here even under time pressure — that library is the reference implementation the facilitator actually speaks.
- **Tests run against `src/test-helpers/fake-server.ts`**, a `fetch`-compatible fake implementing the real x402 wire contract — not a live server. It was also verified once against a real throwaway server instance (mock payment mode) during development; that verification isn't repeatable as an automated test (it needs a running API process) but the fake server's contract was derived from that real run, so it should be trustworthy. If the real server's 402/error response shape ever changes, `fake-server.ts` needs a matching update or the tests will quietly test the wrong thing.
- **Retry logic is deliberately conservative about payment failures**: only `PAYMENT_ALREADY_SETTLED` (an explicit server-documented race) is retried; `PAYMENT_VERIFICATION_FAILED` and friends are not, because retrying a rejected signature just delays the real error. Keep this asymmetry if you touch `src/retry.ts`.
- **Python SDK is Phase 06, not part of this phase** — the original brief's "Tier 0: TypeScript + Python at launch" was deliberately split so each gets full attention rather than both being rushed.
