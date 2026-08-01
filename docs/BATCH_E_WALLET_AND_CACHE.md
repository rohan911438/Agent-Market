# Batch E — Browser Wallet Signing & Redis Cache Wiring (done, item 1 unverified against a live wallet)

Two independent, deferred `docs/ROADMAP.md` Phase 2 items that don't fit
Batch C (deploy reproducibility) or Batch D (CI/observability polish). Split
out here because they're both real, scoped engineering tasks rather than
polish.

## 1. Real browser wallet signing in `apps/web`

**Current state — better than it looks at a glance:** wallet *connection* is
already real. `apps/web/src/lib/wallet-context.tsx` wraps `@perawallet/connect`
properly — `connect()`/`disconnect()`/session reconnect all work against a
real Pera Wallet session, wired into the app via `WalletProvider` in
`layout.tsx` and surfaced through `wallet-connect-button.tsx` / `nav-bar.tsx`.

**The actual gap** is narrower than "build wallet integration from scratch":
only the *payment payload* is mocked. `apps/web/src/lib/x402-client.ts`'s
`buildDemoPaymentHeader(address)` fabricates `{ address, nonce }` — enough for
`MockPaymentProvider` to accept, but not a real signed transaction. It's
called from exactly one place: `apps/web/src/app/explorer/page.tsx:80`.

**Work, informed by what Batch B already proved out** (see
`scripts/testnet/demo-payment.mjs` and `docs/PAYMENT_FLOW.md`):
- Replace `buildDemoPaymentHeader` with real transaction construction using
  `@x402-avm/avm`'s **v2** `ExactAvmScheme` (not the v1 scheme — confirmed in
  Batch B that the live GoPlausible facilitator only accepts v2 for Algorand:
  CAIP-2 network id, `amount` + `extra.feePayer`, fee-payer atomic group).
- The `ClientAvmSigner` for this needs to route `signTransactions` through
  Pera's `peraRef.current.signTransaction([...])` instead of a raw private
  key — Pera's API signs an array of transaction groups and returns signed
  bytes for the ones it's asked to sign, which maps reasonably directly onto
  `ClientAvmSigner.signTransactions(txns, indexesToSign)`. Recommend
  prototyping this in isolation before wiring it into `explorer/page.tsx`,
  since Pera's txn-group input shape and algokit-utils'
  `decodeTransaction`/`encodeSignedTransaction` shapes aren't guaranteed to
  compose without some adaptation.
- Same envelope-wrapping gotcha Batch B hit will apply here too: the v2
  SDK's `createPaymentPayload()` returns only `{x402Version, payload}` — the
  caller (here, `explorer/page.tsx`) still has to add the flat
  `{scheme, network}` from the `PaymentRequirement` the 402 response carried,
  to match our own `PaymentPayloadSchema`.
- Store and resend `X-Wallet-Token` (see `apps/api/src/services/wallet-token.ts`,
  added in the security-hardening batch): after a settled payment, the API
  returns this header — the frontend needs to persist it (e.g. alongside the
  wallet address in `wallet-context.tsx`'s state, or `localStorage`) and
  attach it as `X-Wallet-Token` on subsequent requests to actually get
  promoted to the wallet rate-limit tier. Today nothing in `apps/web` reads
  or sends this header, so real users never get past the anonymous tier.
- UI states to handle: connect-wallet-first, signing-in-progress, user
  rejects the Pera signature prompt, signed-but-facilitator-rejects.

**Done, with one real caveat:**
- `apps/web/src/lib/pera-signer.ts`'s `peraToClientAvmSigner` adapts a
  connected Pera session into `ClientAvmSigner`. Decodes wire bytes with
  `algosdk.decodeUnsignedTransaction` rather than algokit-utils' own
  `Transaction` type — Pera's `SignerTransaction.txn` is typed against
  `algosdk.Transaction` specifically, and the two packages' `Transaction`
  classes aren't the same object even though both parse the same canonical
  format.
- `x402-client.ts`'s new `buildRealPaymentHeader` mirrors
  `demo-payment.mjs`'s proven envelope-wrapping; `explorer/page.tsx` branches
  on the 402 response's `requirement.network` (`"mock"` → the existing demo
  path, anything else → this one).
- `wallet-context.tsx` now exposes `getSigner()` and persists/exposes
  `walletToken` (localStorage, keyed per address); `api-client.ts` sends
  `X-Wallet-Token` and `explorer/page.tsx` captures it from a settled
  response. Verified end-to-end **at the server contract level** with curl
  against a running mock-provider instance: paying promotes the caller from
  the 30/min anonymous tier to the 300/min wallet tier on the next request
  using the returned token.
- New `signing` `FlowState` with its own button label and helper text;
  signing failures (rejection or any other error) land in the existing
  `error` state with a specific message rather than a raw JSON dump.
- **Not verified:** the actual `PeraWalletConnect.signTransaction(...)` call
  against a real Pera mobile app / browser extension — this environment has
  no way to complete a live wallet-approval prompt (the Chrome extension
  used for browser testing wasn't connected either). Typecheck, lint, and
  `next build` all pass, and the adapter defensively handles both plausible
  shapes of Pera's return value for skipped legs (see the comment in
  `pera-signer.ts` and `docs/PAYMENT_FLOW.md`'s "Known gap" section) — but
  that's not a substitute for testing it once against a real funded TestNet
  wallet before this ships to production.

## 2. Wire `RedisCache` to a concrete client

**Current state:** `packages/cache/src/redis-cache.ts`'s `RedisCache` class
and `RedisClientLike` interface are fully implemented and tested-by-contract
against `MemoryCache`'s `ICache` interface — but `createCache()`
(`packages/cache/src/factory.ts`) throws if `driver === 'redis'` and no
client is supplied, and `apps/api/src/build-context.ts` calls
`createCache(config.cache.driver)` with **no client argument at all**. So
setting `CACHE_DRIVER=redis` today throws at boot instead of working.

**Why it matters:** the in-memory rate limiter and cache are single-process
(`docs/SECURITY.md` already flags this). Any horizontally-scaled deployment
(more than one API instance) needs Redis for rate-limit and cache state to be
shared — otherwise each instance enforces its own independent rate limit,
defeating the point.

**Work:**
- Add `ioredis` (or `redis`/`node-redis`) as a real dependency of `apps/api`
  (deliberately not of `packages/cache`, per that package's own doc comment —
  it stays client-agnostic).
- In `build-context.ts`, when `config.cache.driver === 'redis'`, construct a
  real client from `config.cache.redisUrl` and pass it to `createCache('redis',
  client)`.
- Add a Redis integration test (or at minimum extend
  `packages/cache/src/memory-cache.test.ts`'s sibling coverage to also run
  against `RedisCache` with a real/test Redis instance) so this path isn't
  first exercised in production.
- Pairs naturally with Batch D's `docker-compose.yml` item — that's the
  obvious way to get a local Redis for testing this.

**Done:** `apps/api` takes `ioredis` as a real dependency; `build-context.ts`
constructs a client from `config.cache.redisUrl` when `CACHE_DRIVER=redis`
and hands it to `createCache('redis', client)` — `packages/cache` itself
still takes no dependency on it (`ioredis` is a devDependency there, test-only).
`packages/cache/src/redis-cache.test.ts` runs the same contract tests as
`MemoryCache` against a real Redis (`describe.skipIf(!REDIS_URL)` — opt-in
locally via `docker compose up -d redis`, always-on in CI via a new `redis`
service in `ci.yml`). Verified end-to-end against a live server + real Redis
container: cache miss → hit round-trips correctly, and the rate limiter's
token-bucket state lands in Redis too (`agentmarket:ratelimit:*`), which is
the actual point — shared state across instances.

## Suggested order

These two are unrelated — do whichever is more urgent first. The wallet
signing work (1) is bigger and has more product-facing risk (real user
funds, real UX); the Redis wiring (2) is smaller and self-contained, and is
the safer one to pick up first if looking for something quick.
