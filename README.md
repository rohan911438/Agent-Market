# AgentMarket

**x402-native marketplace for premium AI financial-intelligence APIs, settled on Algorand.**

AI agents, trading bots, and autonomous applications discover, purchase, and consume
decision-intelligence endpoints through HTTP 402 micropayments — no subscriptions, no
end-user API keys, no monthly billing. Every call is an on-chain payment.

Instead of `BTC Price = $120,000`, AgentMarket returns:

```json
{
  "symbol": "BTC",
  "action": "BUY",
  "confidence": 92,
  "risk": "LOW",
  "reason": [
    "ETF inflows increasing",
    "Whale accumulation detected",
    "Positive market sentiment",
    "Exchange reserves decreasing"
  ]
}
```

The API explains **why**.

## Status

Phase 1 MVP. `/analyze`, `/market-summary`, `/sentiment`, `/risk-analysis`,
`/trending-assets`, `/execution-readiness`, and `/portfolio-health` run on real market
data end-to-end. `/technical-summary` is real when OHLC data is available, otherwise
marked `"status": "beta"` in its response — see [docs/API.md](docs/API.md) for the exact
contract of every endpoint. See [docs/ROADMAP.md](docs/ROADMAP.md) for what's next.

## Quickstart

```bash
git clone <this-repo>
cd agentmarket
npm install
npm run bootstrap   # copies .env.example -> .env, generates/migrates/seeds the DB

# Run everything (API on :4000, web on :3000)
npm run dev
```

No external API keys are required to run Phase 1 — every default market-data provider
(CoinGecko, Binance, Alternative.me, DefiLlama) is keyless, and the payment provider
defaults to an in-process mock so the full 402 → pay → 200 flow works immediately. See
[docs/INSTALLATION.md](docs/INSTALLATION.md) for the real Algorand TestNet path and
[docs/DEPLOYMENT_GUIDE.md](docs/DEPLOYMENT_GUIDE.md) for shipping it.

## Project structure

```
agentmarket/
  apps/
    web/                 Next.js frontend — landing, API Explorer, dashboard, docs
    api/                 Fastify backend — REST API
  packages/
    shared-types/        zod schemas + inferred TS types (API contracts, shared FE/BE)
    secrets/              SecretManager — typed, validated, redaction-safe env access
    config/                Per-app env schema + typed config loader
    cache/                  ICache + MemoryCache (default) + RedisCache (opt-in)
    database/               Prisma schema, generated client, repository classes
    providers/              ApiProviderRegistry — market-data adapters + fallback chain
    payments/                PaymentProvider abstraction — x402 on Algorand, pluggable
    intelligence-engine/     normalize → collect → merge → score → recommend →
                             confidence → explain → format pipeline
  docs/                     Full documentation set (see below)
  scripts/                  Dev bootstrap helpers
```

## Documentation

- [Architecture](docs/ARCHITECTURE.md)
- [API Reference](docs/API.md)
- [Payment Flow (x402)](docs/PAYMENT_FLOW.md)
- [Database Schema](docs/DATABASE_SCHEMA.md)
- [Installation Guide](docs/INSTALLATION.md)
- [Deployment Guide](docs/DEPLOYMENT_GUIDE.md)
- [Developer Guide](docs/DEVELOPER_GUIDE.md)
- [Security Notes](docs/SECURITY.md)
- [Threat Model](docs/THREAT_MODEL.md)
- [Roadmap](docs/ROADMAP.md)
- [Contributing](docs/CONTRIBUTING.md)

## Tech stack

TypeScript everywhere · Next.js 16 + Tailwind v4 (frontend) · Fastify 5 (backend) ·
Prisma + SQLite (Postgres-ready) · x402 on Algorand · npm workspaces + Turborepo.

## License

Unlicensed — internal MVP.
"# Agent-Market" 
