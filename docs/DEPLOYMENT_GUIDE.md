# Deployment Guide

## Frontend → Vercel

Create the Vercel project from this repo and set **Root Directory** to `apps/web` in
the project's Settings → General (required for any npm-workspaces monorepo on Vercel).
`apps/web/vercel.json` supplies the install/build commands that reach back to the repo
root so the workspace packages resolve correctly.

Set environment variables in the Vercel project:

```
NEXT_PUBLIC_API_URL=https://<your-api-domain>
NEXT_PUBLIC_ALGORAND_NETWORK=testnet
```

## Backend → Render

Render builds `apps/api/Dockerfile` directly, driven by `render.yaml` at the repo root
(`runtime: docker`, `dockerfilePath: ./apps/api/Dockerfile`, `dockerContext: .`). Connect
the repo in the Render dashboard and it picks up `render.yaml` as a Blueprint — no manual
service configuration needed beyond the `sync: false` env vars below, which Render will
prompt for.

**Do the "Migrating SQLite → Postgres" step below *before* your first real production
deploy.** As shipped, `apps/api/Dockerfile`'s runtime image still boots on a local
SQLite file (`file:./prod.db`) with no volume mounted — every deploy/restart wipes the
database, and SQLite can't support more than one running instance. Pointing
`DATABASE_URL` at a real Postgres connection string does **not** work by itself: the
Prisma schema's `datasource provider` is hardcoded to `sqlite`, so the app will fail to
boot against a `postgres://` URL until that's changed (step 1 below).

Required environment variables in production:

```
NODE_ENV=production
DATABASE_URL=<postgres connection string — after completing the migration below>
PAYMENT_PROVIDER=algorand-x402
ALGORAND_NETWORK=testnet   # or mainnet, once ready
X402_FACILITATOR_URL=...
X402_PAY_TO_ADDRESS=...
X402_USDC_ASSET_ID=...
CORS_ORIGIN=https://<your-frontend-domain>
```

Never set `PAYMENT_PROVIDER=mock` in production — that's a dev/test-only provider that
verifies and settles every payment unconditionally.

### Global x402 Challenge (Algorand MainNet)

To enter the [Global x402 Challenge](https://algorand.co/global-x402-challenge), the same
service runs against MainNet with challenge attribution and Bazaar discovery turned on:

```
ALGORAND_NETWORK=mainnet
X402_FACILITATOR_URL=https://facilitator.goplausible.xyz
X402_USDC_ASSET_ID=31566704          # MainNet USDC ASA (TestNet is 10458941)
X402_PAY_TO_ADDRESS=<permanent MainNet address, opted in to ASA 31566704 — keep it fixed
                     for the whole competition; it IS your leaderboard identity>
X402_FEE_PAYER_ADDRESS=<extra.feePayer from GET {facilitator}/supported for MainNet>
X402_CHALLENGE_TAG=x402-global-challenge   # stamped into every requirement's extra.tag;
                                           # settlements without it don't count
X402_BAZAAR_DISCOVERY=true                 # emit discovery metadata so the endpoint is
                                           # cataloged after its first real settlement
# Optional Bazaar listing-card identity (else read from the endpoint domain's
# OpenGraph / llms.txt / agent-card.json):
X402_MERCHANT_NAME=Agent Market
X402_MERCHANT_WEBSITE=https://<your-frontend-domain>
X402_MERCHANT_LOGO=https://<your-frontend-domain>/logo.png
X402_MERCHANT_CATEGORIES=api,algorand,x402,crypto-intelligence
```

Checklist: (1) deploy to a public HTTPS host (not localhost — localhost settlements are
filed under `DEV`); (2) validate the full flow on TestNet first; (3) complete one real
MainNet settlement and confirm USDC lands in `X402_PAY_TO_ADDRESS`; (4) confirm the
endpoint shows in the [Bazaar](https://facilitator.goplausible.xyz/discovery/resources)
and on the leaderboard under the challenge tag; (5) register before the deadline. Do **not**
drive volume with self-payments / cron loops from wallets you control — the rules exclude
"artificial volume, wash transactions, repeated self-payments" and the facilitator files
bot traffic under `DEV`.

## Migrating SQLite → Postgres

The Prisma schema (`packages/database/prisma/schema.prisma`) uses no SQLite-only
features. `docker-compose.yml` already provisions a local Postgres profile
(`docker compose --profile postgres up -d`) for testing this migration before it goes
anywhere near production. To move to Postgres:

1. Change the datasource provider:
   ```prisma
   datasource db {
     provider = "postgresql"
     url      = env("DATABASE_URL")
   }
   ```
2. Point `DATABASE_URL` at your Postgres instance.
3. Regenerate migrations against Postgres and verify the full suite against it —
   SQLite and Postgres differ enough (e.g. `RedefineTables` vs `ALTER TABLE`, raw-SQL
   quoting) that the existing SQLite migration history can't just be replayed as-is.
   Run `npx prisma migrate dev` from `packages/database` against your local Postgres
   profile to generate a fresh, provider-correct migration history, then
   `npx prisma migrate deploy` in each real environment.
4. Only then does `apps/api/Dockerfile` need to change: drop the
   "SQLite file, no volume mounted" comment/behavior and confirm `docker-entrypoint.sh`'s
   `prisma migrate deploy` runs cleanly against the real `DATABASE_URL`.

## CI

`.github/workflows/ci.yml` runs on every push/PR: install → dependency audit →
generate → schema-drift check → lint → typecheck → build → test, across the whole
monorepo via Turborepo's dependency-aware task graph (a package only rebuilds/retests
if it or something it depends on changed).

- **Dependency audit**: `npm audit --omit=dev --audit-level=critical`. Scoped to
  production dependencies and gated at `critical` for now, not `high` — see
  `docs/SECURITY.md` ("Known gaps") for what that excludes and why.
- **Schema-drift check**: `prisma migrate diff --exit-code` against
  `packages/database/prisma/migrations` — fails the build if `schema.prisma` changed
  without a matching committed migration.
- **Test**: `apps/api`'s suite runs with coverage enabled (`vitest run --coverage`),
  gated on the thresholds in `apps/api/vitest.config.ts`.

A separate `dependency-review` job runs on PRs only, flagging newly-introduced
vulnerable/incompatible-license dependencies in the diff (gated at `high`).
`.github/dependabot.yml` opens weekly update PRs for both the npm and github-actions
ecosystems.

## Database migrations in production

Run `npm run db:migrate:deploy` (wraps `prisma migrate deploy`, which — unlike
`migrate dev` — never prompts and never resets data) as a release step before the new
API version starts serving traffic — e.g. via Render's Pre-Deploy Command, or a CI/CD
step that runs before the new image is promoted. `packages/database/prisma/migrations/`
is committed, so `migrate deploy` has a real migration history to apply instead of
relying on `db push`.

## Health check

`GET /health` is a real readiness check, not just a liveness ping: it verifies DB
connectivity (`SELECT 1`) and the cache backend, and best-effort-checks facilitator
reachability when `PAYMENT_PROVIDER=algorand-x402`. It returns `200` with a
per-dependency breakdown when everything required is healthy, or `503` (still with the
breakdown) if the DB or cache check fails — this is what `render.yaml`'s
`healthCheckPath` polls to decide whether an instance is ready to receive traffic.
