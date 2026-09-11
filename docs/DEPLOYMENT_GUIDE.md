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

Required environment variables in production:

```
NODE_ENV=production
DATABASE_URL=<postgres connection string — see migration note below>
PAYMENT_PROVIDER=algorand-x402
ALGORAND_NETWORK=testnet   # or mainnet, once ready
X402_FACILITATOR_URL=...
X402_PAY_TO_ADDRESS=...
X402_USDC_ASSET_ID=...
CORS_ORIGIN=https://<your-frontend-domain>
```

Never set `PAYMENT_PROVIDER=mock` in production — that's a dev/test-only provider that
verifies and settles every payment unconditionally.

## Migrating SQLite → Postgres

The Prisma schema (`packages/database/prisma/schema.prisma`) uses no SQLite-only
features. To move to Postgres:

1. Change the datasource provider:
   ```prisma
   datasource db {
     provider = "postgresql"
     url      = env("DATABASE_URL")
   }
   ```
2. Point `DATABASE_URL` at your Postgres instance.
3. Run `npx prisma migrate deploy` from `packages/database`.

## CI

`.github/workflows/ci.yml` runs on every push/PR: install → generate → schema-drift
check → lint → typecheck → build → test, across the whole monorepo via Turborepo's
dependency-aware task graph (a package only rebuilds/retests if it or something it
depends on changed). The schema-drift check (`prisma migrate diff --exit-code` against
`packages/database/prisma/migrations`) fails the build if `schema.prisma` changed
without a matching committed migration.

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
