# Threat Model

## Assets

1. Upstream provider API keys (NewsAPI, future keyed providers).
2. The Algorand payment facilitator's trust relationship (payTo address, asset id).
3. User/wallet data (addresses, spend history) in the database.
4. Service availability (the API itself).

## Threats & mitigations

| # | Threat | Mitigation |
|---|---|---|
| 1 | Upstream provider key leaks via logs/responses | Keys live only inside `ApiProviderRegistry` adapters; `redactSecrets()` scrubs anything secret-shaped before logging; keys never appear in any response schema. |
| 2 | Replay attack — attacker resubmits a captured `X-PAYMENT` header to get a second free response | `paymentRef` uniqueness + `CachedResponse` replay lookup returns the *original* response, no re-settlement, no re-execution. |
| 3 | Duplicate/concurrent payment — two requests race with the same payment | DB unique constraint on `paymentRef` serializes the race; the loser gets `409 PAYMENT_ALREADY_SETTLED`. |
| 4 | Duplicate *request* (client retries on timeout, not a replay attack) | Same idempotency mechanism as #2 — a retried request with the same payment is safe by construction. |
| 5 | Payment verification bypass — forged/invalid `X-PAYMENT` | Every payment is verified against the active `PaymentProvider` (facilitator `/verify` in production) before any handler runs; a `400 PAYMENT_INVALID` / `402 PAYMENT_VERIFICATION_FAILED` is returned otherwise. |
| 6 | Wallet drains budget via rapid-fire requests | Daily per-wallet spend cap (`DAILY_SPEND_CAP_USD`), enforced before settlement, independent of rate limiting. |
| 7 | Request flood / basic DoS from a single IP or wallet | Token-bucket rate limiting, tiered (anonymous-by-IP vs. wallet-verified), `429` + `Retry-After`. |
| 8 | Upstream market-data provider outage | `ApiProviderRegistry` fallback chain (CoinGecko → Binance → ...) + circuit breaker; a total outage degrades `dataCompleteness` rather than hard-failing the request. |
| 9 | Malformed/malicious request payloads (injection, oversized bodies, wrong types) | zod validation on every route input, running before the payment gate; Fastify's built-in body size limits. |
| 10 | Sensitive error detail leaking to the client (stack traces, provider error bodies) | Global error handler maps every error type to the same `{ error: { code, message, requestId } }` shape; raw error objects/stacks only go to server logs (redacted). |
| 11 | Frontend exposing a provider credential | Frontend only ever calls `apps/api`; `NEXT_PUBLIC_*` env vars are the only ones inlined into the client bundle, and none of them are secrets. |
| 12 | Wallet address spoofing to claim the higher rate-limit tier | Tier promotion requires a valid `X-Wallet-Token` — an HMAC-signed proof (`WALLET_TOKEN_SECRET`) issued by this server only to the address that just completed a settled payment. A bare self-declared `X-Wallet-Address` is never trusted on its own: since Algorand addresses are public on-chain, accepting one unsigned would let anyone impersonate an already-verified wallet. |

## Out of scope for Phase 1 (tracked in ROADMAP.md)

- DDoS protection at the network/CDN layer (belongs to the hosting platform, not the
  application).
- Formal on-chain transaction signature verification inside our own code — delegated to
  the x402 facilitator, which is the correct trust boundary for the "exact" scheme.
- Multi-region/multi-instance rate-limit consistency (needs `CACHE_DRIVER=redis`).
