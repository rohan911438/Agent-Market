# Payment Flow (x402 on Algorand)

## Sequence

```mermaid
sequenceDiagram
    participant Agent as AI Agent / Client
    participant API as AgentMarket API
    participant DB as Database
    participant Fac as x402 Facilitator
    participant Chain as Algorand

    Agent->>API: GET /v1/analyze?symbol=BTC
    API-->>Agent: 402 Payment Required + PaymentRequirements
    Agent->>Agent: construct + sign payment (X-PAYMENT payload)
    Agent->>API: GET /v1/analyze?symbol=BTC  (X-PAYMENT: base64 payload)
    API->>Fac: POST /verify {paymentPayload, paymentRequirements}
    Fac-->>API: { isValid: true, payer }
    API->>DB: INSERT Payment (paymentRef, status=PENDING) [unique constraint]
    API->>Fac: POST /settle {paymentPayload, paymentRequirements}
    Fac->>Chain: broadcast payment
    Fac-->>API: { success: true, transactionId }
    API->>DB: mark wallet verified, run intelligence pipeline
    API->>DB: UPDATE Payment SET status=SETTLED, cache response
    API-->>Agent: 200 OK + structured JSON
```

## Two payment provider modes

### `PAYMENT_PROVIDER=mock` (default)
An in-process `MockPaymentProvider` always verifies/settles successfully. This lets the
entire 402 → pay → 200 flow — including the frontend API Explorer — run with zero
TestNet funds or network access, which is what `npm run dev` uses out of the box. The
demo client (`apps/web/src/lib/x402-client.ts`) builds a payload carrying just the
connected wallet's address and a fresh nonce, since that is all `MockPaymentProvider`
inspects.

### `PAYMENT_PROVIDER=algorand-x402` (production)
`AlgorandX402Provider` calls a real x402 facilitator's `/verify` and `/settle` HTTP
endpoints against Algorand TestNet (or MainNet). In this mode the client must submit an
actual signed Algorand payment transaction per the x402 `exact` scheme — built with the
official `@x402/avm` / `@x402/fetch` client SDKs plus `algosdk` transaction signing.
That construction is a drop-in replacement for `buildDemoPaymentHeader()`; the backend
side (`AlgorandX402Provider`, the payment middleware, the idempotency/settlement logic)
needs no changes to go from mock to real payments — only environment variables:

```bash
PAYMENT_PROVIDER=algorand-x402
ALGORAND_NETWORK=testnet
X402_FACILITATOR_URL=https://facilitator.goplausible.xyz
X402_PAY_TO_ADDRESS=<your Algorand TestNet address>
X402_USDC_ASSET_ID=<USDC-on-Algorand-TestNet asset id>
```

## Idempotency & replay protection

`paymentRef` (extracted from the payment payload's `txId`/`nonce`/`signature`) has a
**unique constraint** in the `Payment` table. The payment middleware:

1. Looks up a `CachedResponse` keyed by `payment:<paymentRef>` first. If found, the
   stored response is replayed verbatim — no re-verification, no re-settlement, no
   re-execution of the intelligence pipeline.
2. Otherwise it attempts `INSERT Payment (paymentRef, status=PENDING)`. If that insert
   violates the unique constraint (a concurrent request already claimed this
   `paymentRef`), it returns `409 PAYMENT_ALREADY_SETTLED` rather than settling twice.
3. Only the request that won the insert proceeds to call the facilitator's `/settle`.

This is what makes duplicate payments, replayed `X-PAYMENT` headers, and concurrent
duplicate requests all safe by construction rather than by best-effort checking.

## Budget limits

Before settling, the middleware sums the wallet's settled spend since UTC midnight and
rejects (`402 BUDGET_EXCEEDED`) if the new payment would exceed `DAILY_SPEND_CAP_USD`
(default $50, configurable). This bounds worst-case damage from a runaway or compromised
agent.
