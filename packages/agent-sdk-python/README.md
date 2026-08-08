# agentmarket-sdk

The demand side of AgentMarket, packaged as Python. Give an autonomous agent a wallet and this client, and it can discover, price, pay for, and call any metered endpoint on the marketplace — with budgets, retries, and fallbacks handled for it.

This is the Python counterpart to `@agentmarket/agent-sdk` (TypeScript) — same feature set and semantics, idiomatic to Python rather than a line-by-line port. See "Decisions" below for where the two intentionally differ.

## Async-first

**This SDK is async-first.** `AgentMarketClient` is built on `httpx.AsyncClient` and every network-touching method is a coroutine. A thin `SyncAgentMarketClient` wrapper is provided for scripts and notebooks that aren't already inside an event loop — it runs the same async client on a dedicated background event loop (not a fresh `asyncio.run()` per call) so budget/cache/usage state persists across calls.

Async-first (with a sync convenience wrapper) rather than sync-first mirrors `openai-python`/`httpx`'s own default, and matches where the agent-framework ecosystem this SDK targets (LangChain, LlamaIndex, CrewAI) is heading: mostly async already, or async-compatible.

```python
import asyncio
from agentmarket_sdk import AgentMarketClient, MockPaymentScheme

async def main():
    agent = AgentMarketClient(
        payment_scheme=MockPaymentScheme(),  # swap for AlgorandPaymentScheme(...) in production
        budget={"per_call_usd": 0.10, "daily_usd": 5},
    )

    risk = await agent.call("/v1/risk-analysis", {"symbol": "BTC"}).fallback("/v1/portfolio-health")
    print(risk)

asyncio.run(main())
```

Sync convenience wrapper — fallbacks are an explicit list here rather than a chained `.fallback(...)`, since sync code has no equivalent of `await`'s ability to defer execution:

```python
from agentmarket_sdk import SyncAgentMarketClient, MockPaymentScheme

with SyncAgentMarketClient(payment_scheme=MockPaymentScheme()) as agent:
    risk = agent.call("/v1/risk-analysis", {"symbol": "BTC"}, fallbacks=[("/v1/portfolio-health", None)])
```

No API key. No subscription. The 402 → pay → 200 loop runs inside `.call()`; you never see an `X-PAYMENT` header unless you go looking for one.

## Install

Inside this monorepo (editable, for development):

```bash
pip install -e "packages/agent-sdk-python[dev]"
```

For real Algorand settlement, install the `avm` extra:

```bash
pip install -e "packages/agent-sdk-python[avm]"
```

## Quickstart

### 1. Pick a payment scheme

**Local dev / CI** — pairs with an AgentMarket server running `PAYMENT_PROVIDER=mock`:

```python
from agentmarket_sdk import MockPaymentScheme
payment_scheme = MockPaymentScheme()
```

**Real settlement** — signs and pays with an actual Algorand account. Needs network access to an Algod node (defaults to AlgoNode's public endpoint) and a funded TestNet/MainNet account. Delegates transaction construction to [`x402-avm`](https://pypi.org/project/x402-avm/) (GoPlausible's own Python SDK for this exact facilitator) rather than hand-rolling Algorand atomic-group signing — the same approach the TypeScript SDK takes with `@x402-avm/avm`:

```python
# Requires the optional `avm` extra (pip install agentmarket-sdk[avm]) —
# not imported from the package root so the base install never needs
# py-algorand-sdk.
from agentmarket_sdk.payment.algorand_scheme import AlgorandPaymentScheme
payment_scheme = AlgorandPaymentScheme(mnemonic=os.environ["AGENT_MNEMONIC"])
```

An unfunded account fails loudly rather than silently — there's no dry-run mode for real settlement.

### 2. Construct the client

```python
agent = AgentMarketClient(
    base_url="http://localhost:4000",  # default
    payment_scheme=payment_scheme,
    budget={"per_call_usd": 0.05, "session_usd": 2, "daily_usd": 10},  # any subset; all optional
    retry={"max_attempts": 3},  # default
    on_event=lambda e: print(e),  # optional — see "Events" below
)
```

### 3. Call something

```python
sentiment = await agent.call("/v1/sentiment")
```

`.call()` returns a `PendingCall` — nothing happens over the network until you `await` it (Python's `__await__` protocol is this SDK's equivalent of the TS SDK's thenable `PendingCall`), optionally after chaining `.fallback()` / `.with_retries()`.

## What it actually does for you

| Feature | How |
|---|---|
| **Automatic payment** | On a 402, reads the real price from the server's response, builds and signs the payment via your configured `PaymentScheme`, retries the request with `X-PAYMENT` set. |
| **Budget limits** | `per_call_usd` / `session_usd` / `daily_usd`. Checked *before* a payment is constructed. Pass the same `Budget` instance (`create_shared_budget`) to multiple clients to cap what a swarm spends in total. |
| **Cost estimation** | `await agent.estimate_cost(resource)` reads the price straight off the 402 response, without paying. |
| **Smart retries** | Retries 5xx, 429, and network errors. Does **not** retry 4xx validation failures or a rejected payment signature. `PAYMENT_ALREADY_SETTLED` (a concurrent-request race) *is* retried. |
| **Fallback APIs** | `.call(primary).fallback(secondary).fallback(tertiary)` — tries each in order, stops at the first success. |
| **Provider selection** | `await agent.discover(category=..., max_price_usd=..., search=...)` filters the public catalog. |
| **Usage tracking** | `agent.get_usage_summary()` — total calls, total spend, broken down per resource. |
| **Response caching** | `cache_ttl_ms` on the client, or `no_cache=True` per call. |
| **Multi-agent coordination** | `create_shared_budget(...)` — one `Budget`, many clients. |
| **Structured errors** | `AgentMarketError` subclasses instead of parsing message strings. |

## Fallbacks

```python
result = await (
    agent.call("/v1/risk-analysis", {"symbol": "BTC"})
    .fallback("/v1/portfolio-health", {"holdings": [...]})
    .fallback("/v1/analyze", {"symbol": "BTC"})
)
```

If every resource fails, the rejection is an `AllProvidersFailedError` carrying every attempt's resource and error in order. If there's no fallback configured at all, a failure surfaces as its original type — `except BudgetExceededError:` works whether or not you ever add a `.fallback()`.

## Errors

```
AgentMarketError                    (base — catch this to catch everything below)
├── BudgetExceededError             .limit: "per_call" | "session" | "daily"
├── UnsupportedPaymentSchemeError   .network: str
├── PaymentFailedError              .server_code: str
├── HttpError                       .status_code: int, .server_code: str
└── AllProvidersFailedError         .attempts: list[Attempt]
```

## Events

`on_event` fires for every meaningful step of a call:

```
call:start -> call:cost_known -> call:paying -> call:success
                                              \-> call:retry (0+)
                                              \-> call:fallback -> call:start (next resource)
                                              \-> call:error
```

## Decisions vs. the TypeScript SDK

- **Async-first, not sync-first** — see above.
- **`.fallback()`/`.with_retries()` chaining is `__await__`-based**, Python's real equivalent of a JS thenable — `await agent.call(...).fallback(...)` reads and works identically to the TS API shape without needing a `.then()` that Python doesn't have.
- **Events are a discriminated set of dataclasses**, not a TS string-literal union — `isinstance(event, CallSuccessEvent)` instead of `event.type == "call:success"` (though `.type` is still there too).
- **The retry-vs-payment-failure asymmetry is preserved exactly**: only `PAYMENT_ALREADY_SETTLED` is retried; everything else that reaches the payment gate fails identically on a second attempt, so it surfaces immediately instead of being masked behind a delay. See `retry.py`.
- **`AlgorandPaymentScheme` ships fully** in this phase — GoPlausible (the same team operating the real facilitator) publishes `x402-avm` on PyPI with an `ExactAvmScheme` implementation whose wire format (verified: field names, CAIP-2 genesis hashes) matches exactly what `packages/payments/src/algorand-x402-provider.ts` expects. No gap here, unlike the more conservative fallback the phase brief allowed for.

## Development

```bash
pip install -e ".[dev]"
pytest
```

Tests run against `agentmarket_sdk.test_helpers.fake_server`, an `httpx.MockTransport`-backed fake implementing the same 402/`X-PAYMENT` contract the real server does — no live server needed. It was also verified once against a real throwaway AgentMarket server instance (mock payment mode) during development, the same way the TypeScript SDK was verified.
