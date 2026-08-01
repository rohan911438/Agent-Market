# Batch C — Deploy Reproducibility (done)

Scoped during the Phase 2 technical audit. Goal: make a fresh deploy of
`apps/api` reproducible and observable, closing the gaps the audit found in
migrations, the container image, the hosting-platform story, and health
checks.

## 1. Commit an initial Prisma migration

**Gap:** `packages/database/prisma/migrations/` does not exist. The schema
has only ever been applied via `prisma db push` (or an uncommitted
`migrate dev`), so there is no versioned migration history to review or to
run with `migrate:deploy` in production — despite both scripts already
existing in `packages/database/package.json`.

**Work:**
- Run `npm run db:migrate -- --name init` (wraps `prisma migrate dev`) against
  a clean database to generate `migrations/<timestamp>_init/migration.sql`.
- Commit the generated migration directory.
- Confirm `npm run db:migrate:deploy` (wraps `prisma migrate deploy`) applies
  it cleanly against a fresh SQLite file.
- Add a migration-check step to CI (`prisma migrate diff` or `--dry-run`)
  so schema drift without a matching migration fails the build.

**Done:** `packages/database/prisma/migrations/20260801092827_init/migration.sql`
is committed; `migrate deploy` verified against a fresh SQLite file; CI runs
`prisma migrate diff --exit-code` right after `db:generate`.

## 2. Harden the Dockerfile

**Gap (`apps/api/Dockerfile`):**
- The final `runtime` stage does `COPY --from=build /repo ./`, copying the
  *entire* monorepo — all source, dev dependencies, build tooling — into the
  production image instead of just `dist/` + production `node_modules`.
- No non-root `USER` directive; the container runs as root.
- No `HEALTHCHECK` instruction (the only health check today is
  `render.yaml`'s `healthCheckPath`, which a non-Render host wouldn't pick up).

**Work:**
- Restructure into a true multi-stage build: `deps` (prod-only
  `npm ci --omit=dev`) → `build` (full install + `tsc`) → `runtime` (copy only
  `dist/`, `package.json`, and the pruned `node_modules` from `deps`).
- Add a dedicated non-root user (`USER node` or a created `appuser`).
- Add `HEALTHCHECK CMD` hitting `/health`.

**Done:** `deps` (npm ci --omit=dev) → `build` (full install + turbo build) →
`runtime` (only each workspace package's `dist/` + `package.json`, the
generated `.prisma/client`, and `deps`' pruned `node_modules`). Runs as
`appuser` (non-root). `HEALTHCHECK` hits `/health` via Node's built-in
`fetch`. Also added a root-level `.dockerignore` — the build context is the
repo root (`render.yaml`'s `dockerContext: .`), and `apps/api/.dockerignore`
was never actually consulted there. Verified with a real `docker build` +
`docker run`: image runs as `appuser`, `/health` responds correctly, and
Docker reports the container `(healthy)`.

## 3. Resolve Railway vs. Render

**Gap:** `docs/DEPLOYMENT_GUIDE.md` hedges with "Backend → Railway / Render,"
but only `render.yaml` is committed — there is no `railway.json`/`railway.toml`
anywhere. Railway support is asserted, not configured.

**Work:** pick one (Render is already configured and is the path of least
resistance) and either:
- commit to Render and simplify `DEPLOYMENT_GUIDE.md` to stop hedging, or
- add real Railway config (`railway.toml` / build settings) if Railway is
  actually the target, and keep both documented with accurate setup steps for
  each.

**Done:** committed to Render. `docs/DEPLOYMENT_GUIDE.md` and the
`docs/ARCHITECTURE.md` deployment diagram no longer mention Railway.

## 4. Make `/health` a real readiness check

**Gap (`apps/api/src/routes/health.route.ts`):** returns
`{ status: 'ok', timestamp }` unconditionally — a liveness check only. It
never verifies DB connectivity, cache backend health, or facilitator
reachability, despite being wired as the platform's health-check path.

**Work:**
- Add a DB check (a trivial `SELECT 1` / `prisma.$queryRaw`).
- Add a cache check (round-trip a throwaway key through `ctx.cache`).
- Optionally surface facilitator reachability (best-effort `GET
  {X402_FACILITATOR_URL}/health`, non-blocking — don't fail the whole health
  check just because a third-party facilitator is slow).
- Return `503` with a per-dependency breakdown on failure, matching the
  `HealthResponse`-style shape other services use (see the real facilitator's
  own `/health` shape for a reasonable model — status/version/timestamp/
  per-dependency status).

**Done:** `{ status, version, timestamp, dependencies: { database, cache,
facilitator? } }`. `database` runs `prisma.$queryRaw\`SELECT 1\``; `cache`
round-trips a throwaway key through `ctx.cache`; `facilitator` only appears
when `PAYMENT_PROVIDER=algorand-x402`, is best-effort with a 2s timeout, and
never affects the overall status/status code. Overall status is `503` iff
the DB or cache check fails. Verified live in a running container: DB-down →
503 with a per-dependency breakdown; facilitator-down alone → still `200
ok`.

## Suggested order

1 (migrations) and 4 (`/health`) are independent and low-risk — good to do
first. 2 (Dockerfile) and 3 (Railway/Render) are coupled — resolve the
platform decision before reworking the Dockerfile around it.
