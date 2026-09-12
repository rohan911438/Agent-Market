# Pitch Research — Agentic Commerce Market & Protocol Landscape

Supporting research for [docs/PITCH_SCRIPT.md](PITCH_SCRIPT.md) and
[docs/PITCH_DECK.md](PITCH_DECK.md): why the agentic-commerce thesis holds up, where
x402/Algorand sit in the current protocol landscape, who else is building in this space,
and the honest caveats. All figures below are external market research, not AgentMarket's
own usage numbers — every claim is sourced, and where sources disagree it's noted rather
than smoothed over.

## 1. The market

Estimates vary a lot by analyst and time horizon — a real sign this is a new-and-forming
category, not a mature one with settled numbers:

| Source | Scope | Estimate |
|---|---|---|
| Grand View Research / Globe Market Research | Agentic commerce market | $5.7B (2025) → $7.7B (2026) → $65.5B (2033), 35.7% CAGR |
| MarketsandMarkets | AI agents market | $7.84B (2025) → $52.62B (2030), ~46% CAGR |
| McKinsey | Agentic commerce revenue | $3T–$5T by 2030 |
| Industry aggregate (various) | Global AI spend | ~$988B (2024) → ~$1.5T (2025) → $2T+ (2026) |

Read: nobody agrees on the exact number, but every estimate independently lands on
"large and compounding fast." The gap between the $65.5B (2033) and $3-5T (2030) figures
is mostly a scope difference — narrow "agentic commerce transaction volume" vs. broad
"AI agents reshaping commerce economics" — not a contradiction.

**What's driving it, structurally:** AI agents execute many small transactions per task
(a research agent might hit a dozen data sources to answer one question), at sub-cent
unit cost — a shape that breaks subscription and per-seat billing and specifically
requires per-call, machine-payable infrastructure. That's the gap x402-style protocols
exist to fill.

## 2. Why now — HTTP 402 sat unused for 29 years

- **RFC 2068 (January 1997)** reserved status code 402 "Payment Required" for a future
  digital-payment mechanism that was never built — no browser ever implemented a client
  half for it, the early web had no standard payment layer, and subscription economics
  won over per-request payment for human users. It became, as one write-up put it, "the
  internet's most famous never-used feature."
- **2025–2026 is when the client half finally showed up** — not humans in browsers, but
  autonomous agents that can sign a payment programmatically and retry a request without
  friction. That's the actual unlock: 402 needed a caller that doesn't mind a
  request-sign-retry loop, and now one exists.
- **Coinbase + Cloudflare** announced the x402 foundation on **September 23, 2025**; the
  **Linux Foundation formalized it April 2, 2026** at the MCP Dev Summit. Launch members
  span 22 organizations — Visa, Mastercard, Stripe, AWS, Google, Microsoft, Shopify,
  American Express, Circle, Solana Foundation, and others — i.e. this isn't a niche
  crypto-only standard, payment incumbents are already at the table.
- **Adoption so far:** Coinbase reported **69,000 active agents, 165 million
  transactions, ~$50M cumulative volume** on x402 by late April 2026 — early, but real
  usage, not a whitepaper.
- **Stripe + Tempo shipped a competing standard, MPP, in March 2026** — confirms the
  category (machine-payable HTTP) is real enough that more than one major payments
  company is building for it simultaneously, not proof either standard has won.

## 3. Protocol landscape — where AgentMarket sits

Three different layers get conflated in "agentic commerce" coverage; it's worth being
precise about which one AgentMarket is:

| Layer | What it answers | Examples |
|---|---|---|
| **Discovery / communication** | How do agents find and talk to each other? | A2A (Google, agent cards + task lifecycle), MCP (tools/resources/prompts) |
| **Payment authorization** | How does an agent prove it's allowed to spend, and how much? | AP2 (Google) — three signed Mandates: Intent, Cart, Payment |
| **Payment settlement** | How does money actually move? | x402 (Coinbase, HTTP 402 + onchain stablecoin), MPP (Stripe + Tempo) |

**AgentMarket doesn't pick one layer — it implements all three on one surface:** an A2A
agent card and MCP server for discovery (this repo publishes both, including a real npm
package agents can `npx` straight into Claude Desktop/Cursor), x402 for settlement, and
its own budget/session-cap system (`_agentmarket.maxCostUsd` /
`maxSessionSpendUsd` / `maxDailySpendUsd`) doing the job AP2's Mandates do — proving an
agent is allowed to spend up to a limit — with a simpler mechanism (a declared cap
checked in-process) instead of a three-document signed-Mandate protocol.

**Honest trade-off:** AP2's Mandate model gives a merchant a portable, cryptographically
verifiable record of *user intent* behind a purchase — useful when a human ultimately
owns the money and needs an audit trail back to their own authorization. AgentMarket's
model is simpler and faster to integrate (no Mandate schema to implement) but doesn't
carry that same user-intent provenance — it's built for the case where the agent itself
is the economic actor, spending against a budget it was configured with, not relaying a
human's specific purchase intent. That's the right trade for machine-to-machine API
metering; it would be the wrong one for, say, an agent buying something on a human's
behalf at a retailer.

## 4. Who else is building here

| Company | Funding | What they actually do |
|---|---|---|
| Skyfire | $9.5M (a16z CSX, Coinbase Ventures) | Agent identity/auth ("Know Your Agent") + payments |
| Basis Theory | $33M | Payments/identity infrastructure layer |
| Nekuda | $5M (Amex Ventures, Visa Ventures) | Agent payment authorization |
| Rye | $14M | Checkout execution for agents |
| Nevermined | — | Payment delegation + merchant-side revenue infra |
| GoPlausible | — | x402 facilitator — the one this repo's `X402_FACILITATOR_URL` actually points at; settles across Algorand, Base, and Solana behind one endpoint |

The pattern: almost everyone funded in this space is building **one layer** — identity,
tokenized checkout, or payment delegation — as infrastructure for *someone else's*
marketplace or agent. One analysis of the space put it plainly: *"VCs are placing the
largest bets on enabling agents to spend money safely and enabling merchants to sell to
agents"* — i.e. the money is going into picks and shovels, not a mine.

**Where AgentMarket differs:** it's not selling picks and shovels to someone else's
marketplace — it *is* the marketplace, with the payment rail built in rather than
integrated as a third-party dependency, and — per the three features shipped this
cycle — agents on both sides of it: buyers metering intelligence calls, and now sellers
self-listing their own capability (`publishCapability()`) with no human review step.
That combination (protocol-native discovery + working settlement + two-sided listings)
is the gap the funded infra players aren't filling, because most of them assume a human
still approves the seller side.

## 5. Why Algorand specifically

- **Sub-cent fees + instant finality** — the two properties that matter for the actual
  transaction shape (many small, time-sensitive calls) rather than for large infrequent
  transfers, where fee/finality matter far less.
- **USDC dominates agent-initiated stablecoin transfers on x402** industry-wide — the
  asset choice (`X402_USDC_ASSET_ID` in this repo's config) tracks what the rest of the
  ecosystem has already converged on, not a contrarian bet.
- **Real facilitator support today, not a roadmap item** — GoPlausible's x402 facilitator
  already settles Algorand mainnet and testnet behind the same endpoint this repo calls.
- **Honest caveat:** Token Terminal's Agentic Payments dashboard recorded Algorand at
  roughly **$80.9K in one week (Jul 27–Aug 2, 2026)** of agentic transfer volume — ahead
  of Polygon and Solana in that dataset, but behind Base. Algorand is a credible, live
  settlement chain for this use case; it is not currently the volume leader. That's a
  fair trade against its fee/finality advantage for a metered-API business specifically,
  not a claim that it's already the dominant chain for agent payments broadly.

## 6. Why go protocol-native (MCP/A2A) instead of "just an API"

- **MCP adoption:** ~97 million monthly SDK downloads by March 2026 (a 970x increase
  since launch), and 28% Fortune 500 implementation in under 18 months. That's a fast
  enough curve that being reachable *inside* an agent's existing tool-calling loop (vs.
  requiring custom integration against a bespoke REST API) is a real distribution
  advantage, not a nice-to-have.
- **A2A adoption:** shipped by Google in April 2025 as the discovery/communication layer
  companion to AP2's payment layer — the two-layer split (A2A talks, AP2 pays) is exactly
  why AgentMarket implements both a discovery protocol (A2A agent card + MCP) and a
  payment protocol (x402) rather than treating either as sufficient alone.
- **Every major cloud vendor shipped an agent marketplace in the trailing 18 months**
  (Salesforce AgentExchange, Google Agentspace, Microsoft, AWS) — the discovery layer is
  becoming standard-issue infrastructure agents will expect, the same way a REST API
  without OpenAPI docs looks incomplete today.

## 7. Risks worth naming, not hiding

- **Numbers are genuinely soft.** A category with a $65.5B (2033) estimate on one end
  and a $3–5T (2030) estimate on the other from credible sources isn't a rounding
  difference — it means the market hasn't settled on what "agentic commerce" even
  includes yet. Don't repeat either figure as if it were precise.
- **Protocol fragmentation is a live risk, not resolved.** x402, AP2, and MPP are three
  different standards from three different large players (Coinbase, Google, Stripe)
  shipped within about six months of each other. It's plausible the market converges on
  one, forks by use case, or stays split for years. Building on x402 is a bet that HTTP
  402 + stablecoin settlement wins the "machine-to-machine API metering" use case
  specifically — a narrower and more defensible bet than "x402 wins agentic commerce
  broadly."
- **Algorand's current agentic-payment volume share is small** relative to Base in the
  one public dataset tracking it. The technical case (fees, finality) is sound; the
  network-effect case is not yet proven at scale.

## Sources

- [Introducing x402 — Coinbase](https://www.coinbase.com/developer-platform/discover/launches/x402)
- [x402 Explained — Sherlock](https://sherlock.xyz/post/x402-explained-the-http-402-payment-protocol)
- [X402 — Wikipedia](https://en.wikipedia.org/wiki/X402)
- [What is x402? — MetaMask](https://metamask.io/news/what-is-x402)
- [Agentic Commerce Market Report — Juniper Research](https://www.juniperresearch.com/research/fintech-payments/ecommerce/agentic-commerce-research-report/)
- [Agentic Commerce Market Size — Grand View Research](https://www.grandviewresearch.com/industry-analysis/agentic-commerce-market-report)
- [Agentic Commerce Market to Surpass USD 95.2 Billion by 2035 — Globe Market Research](https://www.globemarketresearch.com/reports/agentic-commerce-market)
- [45 Agent-to-Agent Payment Stats for 2026 — Nevermined](https://nevermined.ai/blog/agent-to-agent-payment-statistics)
- [49 Agentic Commerce Growth Statistics — Nevermined](https://nevermined.ai/blog/agentic-commerce-growth-statistics)
- [MCP Adoption Statistics 2026 — Digital Applied](https://www.digitalapplied.com/blog/mcp-adoption-statistics-2026-model-context-protocol)
- [2026: The Year for Enterprise-Ready MCP Adoption — CData](https://www.cdata.com/blog/2026-year-enterprise-ready-mcp-adoption)
- [AP2 Protocol Explained — Eco](https://eco.com/support/en/articles/15192002-ap2-protocol-explained-google-s-agentic-commerce-standard-2026)
- [Building trust in AI commerce: Mastercard's agentic protocols](https://www.mastercard.com/global/en/news-and-trends/stories/2026/agentic-commerce-rules-of-the-road.html)
- [Agentic Commerce Infrastructure Startups — Stellagent](https://stellagent.ai/insights/agentic-commerce-infra-startups)
- [Coinbase x402 Alternatives — Nevermined](https://nevermined.ai/blog/coinbase-x402-alternatives)
- [x402: Unlocking the agentic commerce era — Algorand](https://algorand.co/blog/x402-unlocking-the-agentic-commerce-era)
- [Introducing the GoPlausible x402 Facilitator — Algorand](https://algorand.co/blog/introducing-the-goplausible-x402-facilitator-payments-and-intelligence-for-agentic-commerce-on-algorand)
- [July 2026 Algo Insights Report — Algorand](https://algorand.co/blog/july-2026-algo-insights-report)
- [USDC Dominates Agent-Initiated Stablecoin Transfers on x402 — Hokanews](https://www.hokanews.com/2026/08/usdc-dominates-agent-initiated.html)
- [HTTP 402: the payment status code the web ignored for 33 years — DEV Community](https://dev.to/pat9000/http-402-the-payment-status-code-the-web-ignored-for-33-years-31c)
- [402 Payment Required — MDN](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Status/402)
- [Why HTTP 402 slept for 29 years — Medium](https://medium.com/@schoinas.nkls/why-http-402-slept-for-29-years-and-what-finally-woke-it-up-6c438610ca25)
- [The Complete Guide to Agent-to-Agent Marketplaces in 2026 — DEV Community](https://dev.to/nikhilranka23/the-complete-guide-to-agent-to-agent-marketplaces-in-2026-54me)
- [AI Agent Marketplace 2026 — We Are Presta](https://wearepresta.com/ai-agent-marketplace-2026-the-new-app-store-for-autonomous-services/)
