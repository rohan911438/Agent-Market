<p align="center">
  <img src="docs/assets/logo.png" alt="AgentMarket logo" width="120" height="120">
</p>

<h1 align="center">AgentMarket</h1>

**x402-native marketplace for premium AI financial-intelligence APIs, settled in USDC on the Algorand blockchain.**

AI agents, trading bots, and autonomous applications discover, purchase, and consume
decision-intelligence endpoints through HTTP 402 micropayments — no subscriptions, no
end-user API keys, no monthly billing. Every call is a real, on-chain payment.

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

## Live Deployments

| | URL |
|---|---|
| API (Render) | [agentmarket-api-bedc.onrender.com](https://agentmarket-api-bedc.onrender.com) — [`/health`](https://agentmarket-api-bedc.onrender.com/health) |
| Web (Vercel) | [agentmarket-web-rohans-projects-cd679a85.vercel.app](https://agentmarket-web-rohans-projects-cd679a85.vercel.app) |
| Pitch deck | [Google Slides](https://docs.google.com/presentation/d/1B5JbqAXSVYPB3MJI0PZcd3iT6QftsqVr9PQTgDdcW04/edit?usp=sharing) |
| Demo video | [Watch on YouTube](https://youtu.be/sNN5gzBUaK8) |

The API runs on Render (Docker) backed by a managed Postgres (`render.yaml`
provisions both). The web app is a Vercel deployment of `apps/web`, pointed at the Render
API via `NEXT_PUBLIC_API_URL`. Both redeploy automatically on push to `main` — see
[CI/CD & Deployment](#cicd--deployment) below.

**[Global x402 Challenge](https://algorand.co/global-x402-challenge):** the API can run
against Algorand **MainNet** with challenge attribution (`X402_CHALLENGE_TAG=x402-global-challenge`)
and Bazaar discovery (`X402_BAZAAR_DISCOVERY=true`) — every metered endpoint self-catalogs
in the [Bazaar](https://facilitator.goplausible.xyz/discovery/resources) after its first
real settlement through the GoPlausible facilitator. See
[docs/DEPLOYMENT_GUIDE.md](docs/DEPLOYMENT_GUIDE.md#global-x402-challenge-algorand-mainnet).

## Status

All 14 platform-strategy phases are shipped — see [Platform capabilities](#platform-capabilities)
and [phases/README.md](phases/README.md) for the full ledger. Core intelligence endpoints
(`/analyze`, `/market-summary`, `/sentiment`, `/risk-analysis`, `/trending-assets`,
`/execution-readiness`, `/portfolio-health`) run on real market data end-to-end.
`/technical-summary` is real when OHLC data is available, otherwise marked `"status":
"beta"` in its response — see [docs/API.md](docs/API.md) for the exact contract of every
endpoint, and [docs/ROADMAP.md](docs/ROADMAP.md) for what's next.

## Why AgentMarket

An autonomous agent can't fill out a signup form, hold an API key securely, or approve a
recurring subscription. It *can* sign a transaction. x402 turns "pay to access" into a
native HTTP mechanic (`402 Payment Required` → sign → retry → `200`), so AgentMarket sells
intelligence the way an agent actually consumes the internet: one metered call at a time,
paid for the instant it's needed, with the reasoning behind the answer included — not just
a number the agent would have to re-derive a decision from.

## Architecture

### System overview

```mermaid
flowchart LR
    subgraph Vercel
        Web[apps/web — Next.js 16]
    end
    subgraph Render
        Api[apps/api — Fastify 5]
        DB[(Postgres)]
    end
    subgraph External
        Facilitator[x402 Facilitator]
        Providers[CoinGecko / Binance / Alternative.me / DefiLlama]
        Chain[Algorand TestNet]
    end
    Web -->|HTTPS, never sees provider creds| Api
    Api --> DB
    Api --> Facilitator
    Facilitator --> Chain
    Api --> Providers
```

### Request pipeline

```mermaid
flowchart LR
    Client[Client / AI Agent] --> Gateway[Fastify API]
    Gateway --> Validate[preValidation: zod schema]
    Validate --> RateLimit[Rate Limiter]
    RateLimit --> Payment[x402 Payment Gate]
    Payment --> Cache{Cache hit?}
    Cache -- yes --> Formatter[Response Formatter]
    Cache -- no --> Engine[Intelligence Engine]
    Engine --> Providers[Provider Registry]
    Providers --> Formatter
    Formatter --> Audit[Audit / ApiRequest log]
    Audit --> Client
```

Validation runs **before** the payment gate deliberately: an invalid request must fail for
free. If validation ran inside the handler (after payment), a malformed request would
still consume a settled payment before failing.

### Package boundaries

| Package | Responsibility | Depends on |
|---|---|---|
| `shared-types` | zod schemas + inferred types for every API contract | — |
| `secrets` | `SecretManager` — validated, typed, redaction-safe env access | — |
| `config` | Per-app env schema + typed config loader | `secrets` |
| `cache` | `ICache` + `MemoryCache` (default) + `RedisCache` (opt-in, inert until wired) | — |
| `database` | Prisma schema, generated client, one repository class per table | — |
| `providers` | `ApiProviderRegistry` — capability adapters with fallback + circuit breaker | — |
| `payments` | `PaymentProvider` abstraction — x402 protocol logic, provider-agnostic | `shared-types` |
| `intelligence-engine` | The scoring/reasoning pipeline (8 stages) | `providers`, `shared-types` |
| `apps/api` | Fastify HTTP layer: routes, middleware, persistence orchestration | all of the above |
| `apps/web` | Next.js frontend | `shared-types` (contracts only) |

Every package exposes an interface at its boundary (`ProviderAdapter`, `PaymentProvider`,
`ICache`, `Explainer`) so a new implementation can be swapped in via configuration, never
by editing call sites. Full detail, including the intelligence-engine pipeline and
provider fallback-chain diagrams, is in [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## Workflows

### Payment workflow (x402 on Algorand)

```mermaid
sequenceDiagram
    participant Agent as AI Agent / Client
    participant API as AgentMarket API
    participant Fac as x402 Facilitator
    participant Chain as Algorand

    Agent->>API: GET /v1/analyze?symbol=BTC
    API-->>Agent: 402 Payment Required + PaymentRequirements
    Agent->>Agent: construct + sign payment (X-PAYMENT payload)
    Agent->>API: GET /v1/analyze?symbol=BTC (X-PAYMENT: base64 payload)
    API->>Fac: POST /verify
    Fac-->>API: { isValid: true, payer }
    API->>Fac: POST /settle
    Fac->>Chain: broadcast payment
    Fac-->>API: { success: true, transactionId }
    API-->>Agent: 200 OK + structured JSON
```

Every payment reference is idempotency-protected by a unique DB constraint — a replayed
`X-PAYMENT` header returns the original cached response instead of re-settling. Full
sequence, both payment-provider modes (`mock` for local dev, `algorand-x402` for real
settlement), and the replay-protection mechanics: [docs/PAYMENT_FLOW.md](docs/PAYMENT_FLOW.md).

### Local dev workflow

```bash
git clone <this-repo>
cd agentmarket
npm install
docker compose --profile postgres up -d postgres   # the datastore is Postgres
npm run bootstrap   # copies .env.example -> .env, generates/migrates/seeds the DB

npm run dev          # API on :4000, web on :3000, both hot-reloading
```

`DATABASE_URL` defaults to the local compose Postgres
(`postgresql://agentmarket:agentmarket@localhost:5432/agentmarket`). No external API keys
are required — every default market-data provider (CoinGecko, Binance, Alternative.me,
DefiLlama) is keyless, and `PAYMENT_PROVIDER` defaults to an in-process mock so the full
402 → pay → 200 flow works immediately, including from the web app's API Explorer. See
[docs/INSTALLATION.md](docs/INSTALLATION.md) for the real Algorand TestNet / MainNet path.

`docker-compose.yml` also provides Redis for `CACHE_DRIVER=redis` parity — optional for
local dev, which defaults to an in-memory cache.

### CI/CD & Deployment

**CI** (`.github/workflows/ci.yml`) runs on every push/PR to `main`: install →
production-dependency audit → generate Prisma client → schema-drift check → lint →
typecheck → build → test — across the whole monorepo via Turborepo's dependency-aware
task graph, plus a separate `dependency-review` job on PRs that fails on newly introduced
high-severity or license-incompatible dependencies.

**Deploys are git-triggered on both sides:**

```mermaid
flowchart LR
    Dev[git push origin main] --> GH[GitHub: rohan911438/Agent-Market]
    GH -->|webhook| Render[Render: rebuilds apps/api/Dockerfile]
    GH -->|GitHub App| Vercel[Vercel: rebuilds apps/web, root=apps/web]
    Render --> ApiLive[API redeployed]
    Vercel --> WebLive[Web redeployed]
```

- **Backend → Render.** Builds `apps/api/Dockerfile` directly, driven by `render.yaml` at
  the repo root (`runtime: docker`). Connect the repo as a Render Blueprint and it picks
  up `render.yaml` — only the `sync: false` secrets need to be supplied manually.
- **Frontend → Vercel.** Project's **Root Directory** is set to `apps/web`;
  `apps/web/vercel.json` supplies install/build commands that reach back to the repo root
  so npm workspaces resolve correctly in a monorepo.

Full production env-var lists, the Postgres setup, and the Global x402 Challenge MainNet
config: [docs/DEPLOYMENT_GUIDE.md](docs/DEPLOYMENT_GUIDE.md).

## Platform capabilities

All 14 phases of the platform strategy are done — this isn't just the pricing API, it's a
full two-sided marketplace with agent-native discovery protocols on top.

| # | Capability | Where |
|---|---|---|
| 01 | Control-plane API (provider accounts, listings) | `apps/api/src/routes/control-plane/` |
| 02 | Provider dashboard UI | `apps/web/src/app/provider/` |
| 03 | Agent SDK (TypeScript) | `packages/agent-sdk` |
| 04 | Protocol-native catalog (OpenAPI + MCP) | `apps/api/src/routes/catalog/` |
| 05 | A2A protocol support (agent card + task lifecycle) | `apps/api/src/routes/a2a/` |
| 06 | Agent SDK (Python) | `packages/agent-sdk-python` |
| 07 | Revenue platform (provider payouts, ledger) | `apps/api/src/services/revenue.ts` |
| 08 | Trust & verification ladder | `apps/api/src/services/trust-score.ts` |
| 09 | Analytics | `apps/api/src/services/analytics.ts` |
| 10 | Marketplace storefront | `apps/web/src/app/marketplace/` |
| 11 | AI-native discovery/ranking | `apps/api/src/routes/discover.route.ts` |
| 12 | Orchestration engine (multi-step workflows) | `apps/api/src/routes/workflows.route.ts` |
| 13 | Observability (OTel tracing, availability, status page) | `apps/api/src/observability/`, `apps/web/src/app/status/` |
| 14 | MCP agent-native execution (`tools/call` runs for real, budgets, resources, prompts) | `apps/api/src/services/mcp-tool-executor.ts` — see [docs/MCP.md](docs/MCP.md) |

See [phases/README.md](phases/README.md) for the per-phase implementation record.

## API surface

Full request/response contracts: [docs/API.md](docs/API.md). Summary:

| Category | Routes |
|---|---|
| Free | `GET /health`, `GET /v1/marketplace`, `GET /v1/dashboard`, `GET /v1/discover` |
| Metered intelligence | `GET /v1/analyze` ($0.05) · `/v1/market-summary` ($0.02) · `/v1/sentiment` ($0.02) · `/v1/risk-analysis` ($0.03) · `/v1/technical-summary` ($0.03) · `/v1/trending-assets` ($0.02) · `POST /v1/portfolio-health` ($0.04) · `/v1/execution-readiness` ($0.03) |
| Orchestration | `POST /v1/workflows/execute` — compose multiple metered endpoints into one call |
| Third-party gateway | `POST /v1/listings/:slug/invoke` — SSRF-guarded, x402-metered execution of a published listing's OpenAPI operation |
| Provider control-plane | `POST/GET/PATCH /v1/listings*`, `/v1/providers/register`, `/v1/providers/me`, `/v1/providers/me/revenue`, `/v1/providers/me/analytics`, `/v1/providers/api-key/rotate` |
| Admin | `/v1/admin/collections`, `/v1/admin/providers/:id/security-audit` |
| Protocol-native discovery | `GET /.well-known/agent.json` (A2A agent card) · `GET /.well-known/mcp.json` + `POST /mcp` (Model Context Protocol — `tools/call` executes real, payment-gated calls; see [docs/MCP.md](docs/MCP.md)) · `GET /v1/catalog/openapi.json` · per-listing OpenAPI/Postman specs |

Every metered response includes a `meta` envelope (`requestId`, `cacheHit`, `providers`,
`latencyMs`) and errors share one shape (`{ error: { code, message, requestId } }`). Rate
limits: 30 req/min anonymous (by IP), 300 req/min for a wallet verified via a settled
payment.

## Frontend

`apps/web` (Next.js 16, Tailwind v4):

| Route | Purpose |
|---|---|
| `/` | Landing page |
| `/explorer` | API Explorer — call any metered endpoint from the browser, wallet-signed |
| `/marketplace` | Storefront — browse every listed API across providers |
| `/dashboard` | Wallet usage/spend summary + recent requests |
| `/provider` | Provider console — manage listings, pricing, revenue, analytics |
| `/docs` | In-app API documentation |
| `/pricing` | Pricing breakdown per endpoint |
| `/status` | Public status page — live availability, synthetic monitoring |

## On-chain payment details (Algorand TestNet)

Every metered call settles as a real, verifiable Algorand TestNet transaction — no mocked
ledger. The `exact` x402 scheme currently in use is a USDC (ASA) transfer, optionally
split into a 2-transaction atomic group when the facilitator sponsors the payer's network
fee.

| | Address / ID | Explorer |
|---|---|---|
| Network | Algorand TestNet (`algorand:SGO1GKSzyE7IEPItTxCByw9x8FmnrCDexi9/cOUJOiI=`, CAIP-2) | — |
| Merchant (`payTo`) address | `GCPQKFXROLMZV43GID7IYZ6HI4KNPTMHVFZQH3MKP3MKPLI4D3PHKV2R34` | [View on Lora](https://lora.algokit.io/testnet/account/GCPQKFXROLMZV43GID7IYZ6HI4KNPTMHVFZQH3MKP3MKPLI4D3PHKV2R34) |
| USDC asset (ASA ID `10458941`) | TestNet USDC | [View on Lora](https://lora.algokit.io/testnet/asset/10458941) |
| Facilitator fee-payer address | `ZMFK2OI7ZBD2U27ISERZC4S6LKM6WMFJPZQ4MYNJDZ2VNBNMBA67RA22AA` | [View on Lora](https://lora.algokit.io/testnet/account/ZMFK2OI7ZBD2U27ISERZC4S6LKM6WMFJPZQ4MYNJDZ2VNBNMBA67RA22AA) |
| Facilitator | [facilitator.goplausible.xyz](https://facilitator.goplausible.xyz) — verifies + settles every `/verify` and `/settle` call | — |

**Proof of payment:** every dollar the site has ever charged lands in the merchant address
above as USDC — its
[transaction history on Lora](https://lora.algokit.io/testnet/account/GCPQKFXROLMZV43GID7IYZ6HI4KNPTMHVFZQH3MKP3MKPLI4D3PHKV2R34)
is the live, on-chain record of every payment settled from the deployed web app, not a
mocked ledger.

There is no custom on-chain smart contract — AgentMarket is a metering/pricing layer in
front of a standard x402 facilitator, so the only "contract" surface is the ASA above and
the addresses it moves funds between. See [docs/PAYMENT_FLOW.md](docs/PAYMENT_FLOW.md) for
the full 402 → sign → pay → 200 sequence, and
[scripts/testnet/demo-payment.mjs](scripts/testnet/demo-payment.mjs) for a script that
proves it end-to-end against the live facilitator with a real signed transaction.

## SDKs

Autonomous agents call metered endpoints through a client SDK that handles the 402 → pay
→ 200 loop, budgets, retries, and fallbacks automatically — see
[docs/DEVELOPER_GUIDE.md](docs/DEVELOPER_GUIDE.md) for usage.

| | Package | Source |
|---|---|---|
| TypeScript | [`@rohankumar4179/agent-sdk`](https://www.npmjs.com/package/@rohankumar4179/agent-sdk) on npm | [packages/agent-sdk](packages/agent-sdk) |
| Python | `agentmarket-sdk` — publishing to PyPI in progress | [packages/agent-sdk-python](packages/agent-sdk-python) |

Its types/schemas come from [`@rohankumar4179/shared-types`](https://www.npmjs.com/package/@rohankumar4179/shared-types),
published separately and pulled in automatically.

```bash
npm install @rohankumar4179/agent-sdk
# or
pip install agentmarket-sdk
```

Until the Python package's first publish lands, install it straight from source: clone
the repo, then `pip install ./packages/agent-sdk-python`.

## Project structure

```
agentmarket/
  apps/
    web/                 Next.js frontend — landing, API Explorer, marketplace, dashboard,
                          provider console, docs, status page
    api/                 Fastify backend — REST API, control-plane, A2A/MCP protocol routes
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
    agent-sdk/               TypeScript client SDK (npm: @rohankumar4179/agent-sdk)
    agent-sdk-python/        Python client SDK
  docs/                     Full documentation set (see below)
  phases/                   Per-phase implementation record (all 14 done)
  scripts/                  Dev bootstrap + TestNet demo scripts
```

## Documentation

- [Architecture](docs/ARCHITECTURE.md)
- [API Reference](docs/API.md)
- [Payment Flow (x402)](docs/PAYMENT_FLOW.md)
- [Model Context Protocol (MCP)](docs/MCP.md)
- [Database Schema](docs/DATABASE_SCHEMA.md)
- [Installation Guide](docs/INSTALLATION.md)
- [Deployment Guide](docs/DEPLOYMENT_GUIDE.md)
- [Developer Guide](docs/DEVELOPER_GUIDE.md)
- [Security Notes](docs/SECURITY.md)
- [Threat Model](docs/THREAT_MODEL.md)
- [Roadmap](docs/ROADMAP.md)
- [Contributing](docs/CONTRIBUTING.md)
- [Pitch script](docs/PITCH_SCRIPT.md)
- [Pitch deck prompt](docs/PITCH_DECK.md) · [Slides](https://docs.google.com/presentation/d/1B5JbqAXSVYPB3MJI0PZcd3iT6QftsqVr9PQTgDdcW04/edit?usp=sharing)

## Tech stack

TypeScript everywhere · Next.js 16 + Tailwind v4 (frontend) · Fastify 5 (backend) ·
Prisma + Postgres · x402 on Algorand (TestNet + MainNet) · OpenTelemetry · npm workspaces +
Turborepo · GitHub Actions CI · Render (API + managed Postgres) + Vercel (web) for deployment.

## Contributing

See [docs/CONTRIBUTING.md](docs/CONTRIBUTING.md).

## License

[MIT](LICENSE) © Rohan Kumar

## License

Unlicensed — internal MVP.
