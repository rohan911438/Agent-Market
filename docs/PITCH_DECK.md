# AgentMarket — 7-Slide Pitch Deck Prompt

Ready-to-paste prompt for an AI slide generator (Gamma, Tome, Canva Magic Design,
Beautiful.ai, etc.). Built from the actual shipped product — see [docs/PITCH_SCRIPT.md](PITCH_SCRIPT.md)
for the companion 2:35 narration script.

---

```
Create a 7-slide pitch deck for a hackathon/product submission.

TEAM: Brotherhood
MEMBER: Rohan Kumar (solo)
PRODUCT: AgentMarket

TONE: Confident, technical-but-clear, builder-credibility over hype. Dark theme
with teal/blue gradient accents (brand color: cyan-to-blue gradient, black
background — matches the product's own dark UI). Minimal text per slide, let
the diagrams and numbers carry weight.

---

SLIDE 1 — Title
- Product name: AgentMarket
- Tagline: "The Marketplace for AI Agent Commerce"
- Subtitle: x402-native marketplace for premium AI financial-intelligence APIs,
  settled on Algorand
- Team: Brotherhood — Rohan Kumar (solo builder)
- Small footer: live demo links —
  agentmarket-api-bedc.onrender.com · agentmarket-web-rohans-projects-cd679a85.vercel.app

SLIDE 2 — Problem
Headline: "AI agents can't shop the way humans do."
- Autonomous agents need real-time financial/market intelligence to act
- But every existing API requires: signup forms, API keys, monthly subscriptions
  — all things built for humans, not machines
- Free data sources give raw numbers (BTC = $120,000), not decisions — every
  agent has to re-build its own reasoning layer on top
- Result: agent-to-agent commerce has no native payment rail, and market
  intelligence APIs aren't built for machine consumers

SLIDE 3 — Solution
Headline: "Pay-per-call intelligence, native to HTTP."
- AgentMarket sells decision-intelligence, not raw data: instead of a price,
  you get { action: BUY, confidence: 92, risk: LOW, reason: [...] }
- Built on x402 — the HTTP 402 Payment Required status code becomes a real
  payment mechanic: agent hits an endpoint → gets 402 + price → signs a
  transaction → retries → gets 200
- No subscriptions, no API keys — a wallet signature replaces the credential
  entirely
- Every payment settles as a real, verifiable Algorand transaction — not a
  mocked ledger
- Include the 402 → sign → pay → 200 sequence as a simple 4-step diagram

SLIDE 4 — Architecture
Headline: "A real marketplace, not just an endpoint."
- Show a simplified system diagram: AI Agent → Fastify API (validation → rate
  limit → x402 payment gate → intelligence engine → provider registry) → Algorand
  facilitator
- Two-sided: frontend (Next.js) on Vercel, backend (Fastify + Prisma) on Render,
  connected to an x402 facilitator settling on Algorand TestNet
- Intelligence pipeline: normalize → collect → merge → score → recommend →
  assess risk → calculate confidence → explain → format — 8 pure, independently
  testable stages
- Provider-agnostic by design: market-data providers (CoinGecko, Binance,
  Alternative.me, DefiLlama) sit behind a fallback-chain registry; the payment
  provider is a swappable interface (mock for dev, real x402 for production)
- Monorepo: npm workspaces + Turborepo, TypeScript everywhere

SLIDE 5 — What's Built (Traction)
Headline: "13 phases shipped. This isn't a mockup."
Two-column list of what's live today:
- 7 metered intelligence endpoints (analyze, market-summary, sentiment,
  risk-analysis, technical-summary, trending-assets, portfolio-health,
  execution-readiness) — $0.02–$0.05 per call, real market data
- Full provider marketplace: providers can list their own APIs, set pricing,
  get paid — with trust scoring, analytics, and revenue tracking built in
- Agent-native discovery: A2A protocol agent card, MCP server, OpenAPI catalog
  — any agent framework can find and call AgentMarket without custom integration
- TypeScript + Python client SDKs that handle the pay-and-retry loop automatically
- Orchestration engine — compose multiple endpoints into one workflow call
- Production observability: OpenTelemetry tracing, live status page, synthetic
  monitoring
- Both frontend and backend are live and publicly reachable right now

SLIDE 6 — Roadmap
Headline: "From TestNet proof to MainNet scale."
- Near-term: MainNet settlement (currently Algorand TestNet by design, for
  safe iteration), Postgres migration for production durability, wider
  provider onboarding
- Mid-term: LLM-based explanation engine (the reasoning layer is already
  interface-isolated — RuleBasedExplainer swaps for an LLMExplainer with zero
  call-site changes), Redis-backed caching at scale, more asset classes beyond
  crypto
- Long-term: become the default discovery + payment layer for agent-to-agent
  commerce — not just financial intelligence, any metered API an agent needs
- Reference docs/ROADMAP.md for the detailed version

SLIDE 7 — Close / Ask
Headline: "AgentMarket — built solo, shipped end-to-end."
- Recap in one line: the payment and discovery layer for AI agent commerce,
  live today on real infrastructure
- Team: Brotherhood — Rohan Kumar
- Links: GitHub repo, live API, live frontend, status page
- Call to action: "Try it — hit a live endpoint, watch the 402 happen in real time"
```
