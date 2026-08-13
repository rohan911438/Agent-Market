# AgentMarket — 2:35 Pitch Script

Narration script for a demo video / live pitch, timed at ~150 wpm (385 words total).
Pair with screen capture of the live 402 → pay → 200 flow (see
[docs/PAYMENT_FLOW.md](PAYMENT_FLOW.md)) and the `/v1/market-summary` response shape.

---

**[0:00–0:12]**

Right now, every AI agent that wants market intelligence has two bad options: scrape it
for free and get stale, unreliable data — or sign up for a subscription an autonomous
agent can't even fill out.

**[0:12–0:30]**

AgentMarket fixes that. It's an x402-native marketplace — agents pay per API call, in
real USDC, on Algorand, the instant they need it. No signup. No API key. No monthly
invoice. Just an HTTP request that either returns data, or returns a 402 with the price
to unlock it.

**[0:30–0:55]**

Here's the flow: an agent hits `/market-summary` for BTC. Instead of a price, the API
answers `402 Payment Required`, with the exact amount, address, and asset baked into the
response. The agent signs a transaction, retries the same request with the payment
attached, and gets a `200` back — all in under two seconds, no human in the loop.

**[0:55–1:20]**

And what comes back isn't a number — it's a decision. Instead of "BTC = $120,000," you
get BUY, confidence 92, risk LOW, and the four reasons why: ETF inflows, whale
accumulation, sentiment, reserves. Seven endpoints like this — sentiment, risk, technical
signals, portfolio health — each priced two to four cents, each backed by real market
data, not a mock.

**[1:20–1:45]**

This isn't a testnet toy that pretends to charge. Every single call settles as a real,
verifiable Algorand transaction you can look up on a block explorer. We built the
facilitator integration, the wallet signing, the replay protection — the entire payment
rail — so any agent framework can plug in with three lines of code.

**[1:45–2:10]**

And it's not just our endpoints. AgentMarket is a marketplace — any provider can list
their own intelligence API, set their own price, and get paid the same way, with us
handling verification, rate limiting, and revenue settlement. We've already got the
orchestration engine, observability, and a public status page live in production.

**[2:10–2:35]**

The AI economy is agents transacting with agents, at machine speed, with no humans
clicking "subscribe." AgentMarket is the payment and discovery layer that makes that
possible today, on real infrastructure, not a roadmap slide. That's AgentMarket — the
marketplace for AI agent commerce.

---

*385 words · ~150 wpm · 2:35 runtime*
