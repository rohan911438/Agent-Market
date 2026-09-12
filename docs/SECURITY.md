# Security Notes

## Secret handling

- **`SecretManager`** (`packages/secrets`) is the only sanctioned way to read env vars
  server-side. It validates the entire schema at process boot — the app fails fast
  rather than partially booting with missing config — and never includes a secret
  *value* in a thrown error or a log line (only key names).
- **`redactSecrets()`** (also `packages/secrets`) deep-clones any object and replaces
  values whose key looks secret-shaped (`/key|token|secret|password|credential|auth/i`)
  with `[REDACTED]`. The global error handler and `AuditLog.metadata` both pass through
  it before anything is logged or persisted.
- **`.env` is git-ignored from the first commit**; only `.env.example` files (no real
  values) are committed.
- No secret is ever interpolated into a response body, an `AuditLog` row without
  redaction, or shipped to `apps/web` — the frontend only ever reads `NEXT_PUBLIC_*`
  values (API base URL, network name), which Next.js inlines into the client bundle by
  design and which contain nothing sensitive.

## Provider isolation

- `ApiProviderRegistry` (`packages/providers`) is the only thing that holds upstream API
  keys. Callers (the intelligence engine, route handlers) only ever call capability
  methods (`fetchPrice`, `fetchFearGreed`, ...) — a credential is never passed through
  a call site.
- The browser never talks to CoinGecko, Binance, Alternative.me, DefiLlama, NewsAPI, or
  the x402 facilitator directly. Every external call is backend-only.

## Payment safety

See [PAYMENT_FLOW.md](PAYMENT_FLOW.md) for the full idempotency/replay design. In
summary: `Payment.paymentRef` has a DB-level unique constraint, so duplicate/replayed
payments cannot double-settle even under concurrent requests, and a daily per-wallet
spend cap bounds worst-case exposure to a compromised or runaway agent. The cap itself
is enforced by a single atomic conditional UPDATE
(`WalletRepository.reserveDailySpend`), not a read-then-compare — two concurrent
payments for the same wallet can never both observe "under the cap" and both proceed.
A reservation is released if the payment then fails or turns out to be a duplicate, so
a failed attempt never permanently eats into the cap.

## Input validation

Every route's query/body is parsed through a zod schema in a `preValidation` hook —
**before** the payment gate runs, so an invalid request is rejected for free rather
than after consuming a settled payment. Unknown/malformed `X-PAYMENT` headers are
rejected with `400 PAYMENT_INVALID` before any facilitator call is made.

## Rate limiting & abuse controls

Token-bucket rate limiting (anonymous-by-IP, promoted to a higher wallet-verified tier
only after a real settled payment) plus per-wallet daily spend caps are the two layers
protecting against request floods and runaway spend. Applied globally to every route
(a single hook in `server.ts`), not just the x402-metered ones — free endpoints
(marketplace listing, provider registration, discovery search) are equally covered, so
they can't be spammed or used to write unlimited `ProviderAccount` rows for free. Only
`/health` is exempt, so uptime/load-balancer probes never fail or eat into real
traffic's budget. See [THREAT_MODEL.md](THREAT_MODEL.md) for the full enumeration of
abuse scenarios considered.

## Dependency scanning

CI runs `npm audit --omit=dev --audit-level=critical` on every push/PR, plus
`dependency-review-action` on PRs (flags newly-introduced vulnerable/
incompatible-license dependencies in the diff, gated at `high`). `dependabot.yml`
opens weekly update PRs for both the npm and github-actions ecosystems.

The `--omit=dev` scope and `critical` gate are deliberate, not permissive by
accident — see "Known gaps" below for what that currently excludes and why.

## Known gaps (tracked, not blocking Phase 1)

- `npm audit` (full tree, including devDependencies) reports vulnerabilities in
  transitive build tooling (`vitest`/`vite`/`esbuild` via `@vitest/coverage-v8`,
  Prisma CLI, Turbo) — none are in the runtime dependency graph of `apps/api` or
  `apps/web`, which is why CI's audit gate is scoped to `--omit=dev`.
- ~~`next` bundles vulnerable transitive `postcss`/`sharp`~~ — fixed: bumped
  `next` (`^16.2.12` → `^16.3.2`, which vendors a patched `postcss`) and the
  top-level `postcss` devDependency to the same patched line.
- ~~`next` (up to and including 16.3.2) had two unauthenticated-RCE
  advisories~~ (GHSA-p293-qw3h-jr36, GHSA-2xp9-vwfh-vxw4) — fixed 2026-09-12:
  `npm audit fix` resolved `next` to `16.3.5` within the existing `^16.3.2`
  range (no `package.json` change needed), along with `fastify` (→5.12.4),
  `hono` (→4.13.7, transitive), `nanoid` (→3.3.19), `qs` (→6.16.0), `sharp`
  (→0.35.4), and `fast-uri` (→3.1.7/4.1.4) — every finding that was in the
  `--omit=dev` production scope. This CI job had been silently red for two
  pushes before this fix; a future push failing here should be investigated
  immediately rather than assumed unrelated. **Caught during a live x402
  MainNet challenge submission push — see docs/PAYMENT_FLOW.md's "Bazaar
  discovery" section for the payment-side bug found in the same session.**
- `npm audit --omit=dev` still reports one high-severity finding with no
  non-breaking resolution available (`npm audit fix` alone doesn't move it;
  forcing would pull a breaking major bump of packages several layers removed
  from anything this repo calls directly): `deepmerge-ts` via `@prisma/config`
  → `prisma` — the Prisma CLI, which only runs at build/migrate time, not in
  the running server. This is why CI's audit gate is `critical` rather than
  `high` — ratchet it back up once this is resolved upstream (Dependabot will
  surface the patched version once Prisma releases it).
- The default `CACHE_DRIVER=memory` cache/rate-limiter is single-process. Set
  `CACHE_DRIVER=redis` + `REDIS_URL` for a multi-instance deployment — this is now
  fully wired (`apps/api/src/build-context.ts` constructs a real `ioredis` client),
  not just a written-but-unused adapter.
- CSRF is not a concern for this API (no cookie-based session state; every metered
  request must carry its own payment proof), but a browser-based admin panel added
  later would need to reconsider this.
- **Resolved:** `apps/api`'s runtime previously booted on an in-container SQLite file
  with no volume mounted (no durability across redeploys, no horizontal scaling —
  SQLite is single-writer). Production now runs on the managed Postgres `render.yaml`
  provisions (`fromDatabase` wires `DATABASE_URL`), and local dev/CI run against a real
  Postgres too — see [DEPLOYMENT_GUIDE.md](DEPLOYMENT_GUIDE.md#database-postgres).
