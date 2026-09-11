# Batch D — Polish (done, except item 2)

Scoped during the Phase 2 technical audit. Lower-priority items that don't
block a correct or secure deploy, but are worth closing out once Batch C
(deploy reproducibility) lands.

## 1. CI dependency/security scanning

**Gap (`.github/workflows/ci.yml`):** the pipeline runs install → `db:generate`
→ lint → typecheck → build → test, but has no `npm audit`, Dependabot config,
or CodeQL/dependency-review step — a real gap for an API that handles
payments.

**Work:**
- Add an `npm audit --audit-level=high` (or `audit-level=critical` to start,
  to avoid noisy low-severity blocking) step to CI.
- Add a `dependabot.yml` for automated dependency PRs on the npm ecosystem.
- Consider GitHub's `dependency-review-action` on PRs to flag newly
  introduced vulnerable/incompatible-license dependencies before merge.

**Done:** `npm audit --omit=dev --audit-level=critical` runs in CI (scoped to
production deps, gated at `critical` rather than `high` for now — 3 known
high-severity findings in `next`'s bundled `postcss`/`sharp` are tracked in
`docs/SECURITY.md`, not silently ignored). `.github/dependabot.yml` opens
weekly PRs for the npm and github-actions ecosystems. A `dependency-review`
job runs on PRs, gated at `high`.

## 2. Observability beyond basic logging

**Current state:** structured logging via Fastify's built-in Pino logger with
request IDs and secret redaction — real, but that's the entire observability
surface today. No APM, no metrics endpoint, no error aggregation.

**Work (pick based on actual need, don't over-build):**
- A `/metrics` endpoint (e.g. `prom-client`) if there's a Prometheus/Grafana
  target to scrape it.
- Error tracking (Sentry or similar) if there's a team that would actually
  triage alerts from it — otherwise this is dead weight.

**Not done (deliberately):** no Prometheus/Grafana target or Sentry account
exists yet — confirmed with the team rather than assumed. Revisit if/when
one does; adding either now would be exactly the dead weight this item
warns against.

## 3. Test coverage thresholds and load tests

**Gap:** `apps/api/vitest.config.ts` has no `test.coverage` block — CI runs
tests but never gates on coverage. No load/perf tests exist (no k6,
autocannon, artillery scripts) despite this being a payment-metered API where
latency under load is directly a product concern (rate limiting, spend-cap
math, DB writes all sit on the request path).

**Work:**
- Add a coverage config with realistic initial thresholds (start from
  current actual coverage, don't invent an arbitrary target that immediately
  fails CI).
- Add one basic load test script (e.g. autocannon) against `/v1/analyze` with
  `PAYMENT_PROVIDER=mock`, to catch obvious regressions in the hot path
  (rate limiter, payment gate, cache).

**Done:** `apps/api/vitest.config.ts` has a `coverage` block (v8 provider,
scoped to `src/**`, composition-root/entrypoint files excluded) with
thresholds set from the actual baseline at introduction (~60/74/79/60
stmts/branches/funcs/lines), not an arbitrary number — `apps/api`'s `test`
script now runs with `--coverage` so CI gates on it. `apps/api/scripts/load-test.mjs`
(`npm run load-test`) is a real autocannon run against a locally running
server with a fresh payment nonce per request, verified end-to-end against a
live instance.

## 4. Local dev parity

**Gap:** no root-level `docker-compose.yml` — local dev relies on the SQLite
file DB directly via `npm run dev`, with no containerized Postgres/Redis for
parity with a scaled-up production setup (relevant once `CACHE_DRIVER=redis`
is actually wired to a concrete client, per `docs/ROADMAP.md` Phase 2).

**Work:** add a `docker-compose.yml` with Redis (and Postgres, if/when the
DB moves off SQLite) for local dev, gated behind opt-in `CACHE_DRIVER=redis`
so it stays optional.

**Done:** root-level `docker-compose.yml` — `redis` by default, `postgres`
behind a `--profile postgres` flag. Verified both come up healthy. Redis
still isn't wired to a concrete client (that's `docs/ROADMAP.md`'s own
Phase 2 item, out of scope here) — this is infrastructure prep for when
that lands, not a functional change to the app.

## 5. Docs pass

Once Batches C and D's actual work lands, do one pass over
`docs/DEPLOYMENT_GUIDE.md`, `docs/SECURITY.md`, and `docs/ARCHITECTURE.md` to
make sure they describe reality rather than the pre-Batch-C state (e.g.
migration workflow, Dockerfile shape, whichever of Railway/Render was chosen,
`/health`'s real dependency checks).

**Done:** `docs/DEPLOYMENT_GUIDE.md`'s CI section now lists the audit/
dependency-review/coverage steps; `docs/SECURITY.md` has a new "Dependency
scanning" section plus updated "Known gaps"; `docs/INSTALLATION.md` covers
`npm run load-test` and the optional `docker-compose.yml` infra.
`docs/ARCHITECTURE.md` was already updated in Batch C (Railway removed from
the deployment diagram).

## Suggested order

1 (CI scanning) is cheap and independent — do it any time. 3 (coverage/load
tests) and 4 (compose) are nice-to-haves, lowest urgency of the two batches.
5 (docs pass) should be last, after C and D's actual changes exist to
document.
