# Installation Guide

## Prerequisites

- Node.js ≥ 20 (developed against Node 24)
- npm ≥ 10

A local Postgres is required (the Prisma schema is Postgres-native — see
[DATABASE_SCHEMA.md](DATABASE_SCHEMA.md)); no Redis and no third-party API keys are
required otherwise — the default cache is in-memory, and every default market-data
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

Start local Postgres:

```bash
docker compose --profile postgres up -d postgres
```

Defaults work as-is for local dev otherwise (`PAYMENT_PROVIDER=mock`,
`CACHE_DRIVER=memory`, `DATABASE_URL=postgresql://agentmarket:agentmarket@localhost:5432/agentmarket`
— matching the docker-compose credentials above).

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

`apps/api`'s integration tests run against a real (throwaway) Postgres database —
`apps/api/test/global-setup.ts` drops and recreates the `public` schema against the
local docker-compose Postgres (or `DATABASE_URL`, if already pointed at Postgres — CI
sets its own), then `prisma db push`es the current schema before each run. Tests exercise
the real Fastify server through `.inject()` — no separate server process needed.
`apps/api`'s suite runs with coverage enabled and is gated on the thresholds in
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

## Optional: Redis (for cache/rate-limiter parity)

Postgres (above) is required; Redis is not — `npm run dev` works with the default
in-memory cache. For parity with a scaled-up, multi-instance setup:

```bash
docker compose up -d     # Redis
```

`CACHE_DRIVER=redis` in `apps/api/.env` (with the Redis above running) switches the
cache and rate-limiter to it — set `REDIS_URL=redis://localhost:6379` alongside it.

## Optional: keyed providers

Set `NEWS_API_KEY` in `apps/api/.env` to enable the news-sentiment signal blended into
`/v1/sentiment` and `/v1/analyze`. Everything works identically without it — the
provider registry marks it unavailable and the pipeline falls back to Fear & Greed
alone.
