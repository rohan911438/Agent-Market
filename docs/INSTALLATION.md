# Installation Guide

## Prerequisites

- Node.js ≥ 20 (developed against Node 24)
- npm ≥ 10

No database server, no Redis, and no third-party API keys are required for Phase 1 —
SQLite is a file, the default cache is in-memory, and every default market-data
provider is keyless.

## Setup

```bash
git clone <this-repo>
cd agentmarket
npm install
```

Copy the example env files:

```bash
cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env
cp packages/database/.env.example packages/database/.env
```

Defaults work as-is for local dev (`PAYMENT_PROVIDER=mock`, `CACHE_DRIVER=memory`,
`DATABASE_URL=file:./dev.db`).

## Database

```bash
npm run db:generate   # prisma generate
npm run db:migrate    # prisma migrate dev --name init
npm run db:seed       # seeds Provider + MarketplaceApi rows
```

## Run

```bash
npm run dev
```

This starts `apps/api` on `:4000` and `apps/web` on `:3000` in parallel via Turborepo.
Visit `http://localhost:3000` and try the **API Explorer** — it exercises the full
402 → pay → 200 flow against the mock payment provider with zero extra setup.

## Switching to the real Algorand TestNet payment flow

By default `PAYMENT_PROVIDER=mock` so the demo works without funded accounts. To use a
real x402 facilitator on Algorand TestNet:

1. Create/fund an Algorand TestNet account (e.g. via the
   [Algorand TestNet Dispenser](https://bank.testnet.algorand.network/)) and opt it into
   the TestNet USDC asset you intend to accept.
2. Set in `apps/api/.env`:
   ```bash
   PAYMENT_PROVIDER=algorand-x402
   ALGORAND_NETWORK=testnet
   X402_FACILITATOR_URL=https://facilitator.goplausible.xyz
   X402_PAY_TO_ADDRESS=<your funded TestNet address>
   X402_USDC_ASSET_ID=<TestNet USDC asset id>
   ```
3. Clients must now submit a real signed x402 payment (built with `@x402/avm` /
   `@x402/fetch` + `algosdk`) instead of the demo mock payload — see
   [PAYMENT_FLOW.md](PAYMENT_FLOW.md).

## Running tests

```bash
npm test              # every package + apps/api's integration suite
```

`apps/api`'s integration tests spin up a throwaway SQLite database via
`prisma db push` (see `apps/api/test/global-setup.ts`) and exercise the real Fastify
server through `.inject()` — no separate server process needed. `apps/api`'s suite
runs with coverage enabled and is gated on the thresholds in
`apps/api/vitest.config.ts`.

## Load testing

```bash
npm run load-test     # basic autocannon run against a locally running apps/api
```

Requires `apps/api` already running (`npm run dev`) with `PAYMENT_PROVIDER=mock`, the
default. Exercises the real `/v1/analyze` hot path — rate limiter, x402 verify/settle,
intelligence engine, cache, DB writes — with a fresh payment nonce per request. See
`apps/api/scripts/load-test.mjs` for options (target URL, duration, connections) and a
note on the default rate limit dominating throughput from a single IP.

## Optional: local dev infra (Redis / Postgres)

`npm run dev` needs no external infrastructure — SQLite + the in-memory cache are the
Phase 1 defaults. For parity with a scaled-up setup:

```bash
docker compose up -d                        # Redis only
docker compose --profile postgres up -d     # + Postgres
```

`CACHE_DRIVER=redis` in `apps/api/.env` (with the Redis above running) switches the
cache and rate-limiter to it — set `REDIS_URL=redis://localhost:6379` alongside it.
Postgres is still infra prep only (Phase 1 stays on SQLite).

## Optional: keyed providers

Set `NEWS_API_KEY` in `apps/api/.env` to enable the news-sentiment signal blended into
`/v1/sentiment` and `/v1/analyze`. Everything works identically without it — the
provider registry marks it unavailable and the pipeline falls back to Fear & Greed
alone.
