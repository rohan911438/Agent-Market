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
spend cap bounds worst-case exposure to a compromised or runaway agent.

## Input validation

Every route's query/body is parsed through a zod schema in a `preValidation` hook —
**before** the payment gate runs, so an invalid request is rejected for free rather
than after consuming a settled payment. Unknown/malformed `X-PAYMENT` headers are
rejected with `400 PAYMENT_INVALID` before any facilitator call is made.

## Rate limiting & abuse controls

Token-bucket rate limiting (anonymous-by-IP, promoted to a higher wallet-verified tier
only after a real settled payment) plus per-wallet daily spend caps are the two layers
protecting against request floods and runaway spend. See
[THREAT_MODEL.md](THREAT_MODEL.md) for the full enumeration of abuse scenarios
considered.

## Known gaps (tracked, not blocking Phase 1)

- `npm audit` reports vulnerabilities in transitive build tooling (Prisma CLI, Turbo)
  dependencies — none are in the runtime dependency graph of `apps/api` or `apps/web`.
  Re-audit before a production deploy.
- The in-memory rate limiter and cache are single-process; a multi-instance deployment
  needs `CACHE_DRIVER=redis` (the `RedisCache` adapter is written, just not wired to a
  concrete redis client by default — see `packages/cache/src/redis-cache.ts`).
- CSRF is not a concern for this API (no cookie-based session state; every metered
  request must carry its own payment proof), but a browser-based admin panel added
  later would need to reconsider this.
