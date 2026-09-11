# Roadmap

## Phase 1 — Core Infrastructure ✅ (this build)

Monorepo scaffold, `SecretManager`/`ApiProviderRegistry`/`ProviderAdapter` abstractions,
Prisma schema + repositories, cache abstraction, provider fallback chain, deterministic
intelligence engine, x402 payment abstraction with mock + Algorand providers, Fastify
API with all 8 endpoints live, Next.js frontend (landing, API Explorer, dashboard,
marketplace, pricing, docs), tests, docs, CI, deployment configs.

## Phase 2 — x402 Integration Hardening

- ✅ Real funded Algorand TestNet account + the live GoPlausible facilitator, proven
  end-to-end via `scripts/testnet/demo-payment.mjs`: a real signed USDC-ASA transfer
  settles on TestNet and the API returns 200. See `docs/PAYMENT_FLOW.md` for the
  x402 v2 protocol details this required (the facilitator's AVM "exact" scheme only
  accepts x402 v2 — CAIP-2 network id, `amount` field, fee-payer atomic group —
  despite v1/legacy entries appearing in its `/supported` discovery listing).
- Client-side real transaction construction/signing via `@x402-avm/avm` + a browser
  wallet (Pera/Defly, WalletConnect) in `apps/web`, replacing the demo mock-payment
  payload builder — proven so far only via the Node.js script above, not the browser
  UI.
- ✅ `RedisCache` wired to a concrete client (`ioredis`, constructed in
  `apps/api/src/build-context.ts` when `CACHE_DRIVER=redis`) for
  multi-instance rate-limit/cache consistency. Verified end-to-end against a
  real Redis instance — cache and rate-limiter state both round-trip
  correctly. `packages/cache/src/redis-cache.test.ts` runs the same
  contract tests as `MemoryCache` against a real Redis (local via
  `docker compose up -d redis`, or CI's `redis` service).

## Phase 3 — Market Intelligence Depth

- `LLMExplainer` implementing the existing `Explainer` interface — richer natural-
  language reasoning on top of the same deterministic signal scores.
- Per-symbol volatility in `/v1/portfolio-health` (currently concentration-only risk
  model) via batched OHLC fetches.
- Additional signal sources (on-chain whale flows, exchange reserve deltas) behind new
  `ProviderAdapter`s.

## Phase 4 — Dashboard Depth

- Time-series usage charts, per-endpoint spend breakdown, exportable billing history.
- Wallet-native auth (sign-in-with-Algorand) instead of pasting an address.

## Phase 5 — Marketplace

- Third-party API listings (not just AgentMarket's own endpoints) with the same x402
  metering, `payTo` routing per listing.
- Provider/publisher self-serve onboarding.

## Phase 6 — AI Personalization

- Per-agent risk tolerance profiles influencing `recommendationEngine` thresholds.
- Subscription-free "watchlists" with webhook/streaming delivery of `/analyze` deltas.

## Phase 7 — Enterprise Features

- Configurable enterprise rate-limit tier (beyond anonymous/wallet-verified).
- SSO/audit-log export, SLA-backed uptime, dedicated facilitator relationship.
