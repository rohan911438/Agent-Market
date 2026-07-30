# API Reference

Base URL: `http://localhost:4000` in development.

Every metered endpoint requires a valid `X-PAYMENT` header (see
[PAYMENT_FLOW.md](PAYMENT_FLOW.md)) and returns the `meta` envelope on success:

```ts
meta: {
  requestId: string;
  timestamp: string;      // ISO 8601
  status: "live" | "beta";
  cacheHit: boolean;
  providers: string[];    // which upstream provider(s) actually served this response
  latencyMs: number;
}
```

All errors — validation, payment, rate limit, provider outage, unhandled exception —
return the same shape:

```json
{ "error": { "code": "VALIDATION_ERROR", "message": "...", "requestId": "..." } }
```

## Free routes

| Route | Description |
|---|---|
| `GET /health` | Liveness check. |
| `GET /v1/marketplace` | Lists every metered endpoint, price, and live/beta status. |
| `GET /v1/dashboard?wallet=<address>` | Usage/spend summary + recent requests for a wallet. |

## Metered routes

### `GET /v1/analyze`
**$0.05 · live.** The flagship endpoint.

Query: `symbol` (required, e.g. `BTC`), `timeframe` (`1h`\|`24h`\|`7d`\|`30d`, default `24h`).

```json
{
  "symbol": "BTC",
  "action": "BUY",
  "confidence": 92,
  "risk": "LOW",
  "reason": ["Strong upward momentum ...", "Market sentiment is greedy ..."],
  "marketSummary": "BTC is trading at $68,420.11, +4.20% (24h).",
  "liquidityScore": 88,
  "volatility": 27,
  "sentiment": { "score": 78, "label": "GREED" },
  "technicalSummary": "Trend: UPTREND (strength 71/100). Momentum score 64. Volatility 27/100.",
  "recommendation": "Consider accumulating. Risk level: LOW.",
  "meta": { "...": "..." }
}
```

### `GET /v1/market-summary`
**$0.02 · live.** Query: `symbol`, `timeframe`. Price, 24h change, volume, market cap,
liquidity score, volatility.

### `GET /v1/sentiment`
**$0.02 · live.** Query: `symbol` (optional — omit for market-wide). Fear & Greed index,
label, optional news sentiment (only populated when `NEWS_API_KEY` is configured).

### `GET /v1/risk-analysis`
**$0.03 · live.** Query: `symbol`, `timeframe`. Risk level/score, volatility, liquidity,
drawdown risk, and the specific factors driving the score.

### `GET /v1/technical-summary`
**$0.03 · live when OHLC candles are available, else `beta`.** Query: `symbol`,
`timeframe`. Trend direction, momentum, support/resistance.

### `GET /v1/trending-assets`
**$0.02 · live.** Query: `limit` (default 10, max 50). Ranked list of trending assets.

### `POST /v1/portfolio-health`
**$0.04 · live.** Body: `{ "holdings": [{ "symbol": "BTC", "quantity": 0.5 }, ...] }`
(1–50 holdings). Total value, diversification score (Herfindahl-based), concentration
warnings, a risk score derived from concentration. Not cached — portfolio composition
is per-caller.

### `GET /v1/execution-readiness`
**$0.03 · live.** Query: `symbol`, `timeframe`. Whether current liquidity/volatility
conditions favor executing a trade now (`READY`\|`CAUTION`\|`NOT_READY`), plus an
estimated slippage percentage.

## Rate limits

| Tier | Limit | How it's determined |
|---|---|---|
| Anonymous | 30 req/min (configurable) | By IP |
| Wallet-verified | 300 req/min (configurable) | `X-Wallet-Address` header, wallet has ≥1 settled payment |

`429` responses include `Retry-After` and `X-RateLimit-*` headers.

## Idempotency

Every payment reference (`paymentRef`, derived from the X-PAYMENT payload) is unique.
Retrying the exact same `X-PAYMENT` header returns the original response
(`X-Payment-Replay: true`) instead of re-settling or re-executing the request.
