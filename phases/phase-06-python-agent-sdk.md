# Phase 06 — Python Agent SDK

## Context

`packages/agent-sdk` (`@rohankumar4179/agent-sdk`, TypeScript) is the reference implementation of AgentMarket's demand-side client — `AgentMarketClient` running the 402 → pay → 200 loop behind a fluent `.call().fallback().withRetries()` API, pluggable `PaymentScheme`s (mock for dev, real Algorand settlement via `@x402-avm/avm` for production), shareable `Budget`s, transient-only retries, and usage tracking. Read `packages/agent-sdk/README.md` and `packages/agent-sdk/src/client.ts` before starting — this phase ports the *design*, not a line-by-line transliteration, since Python's idioms (sync vs. async, context managers, dataclasses) differ from the TS version's.

Python matters because most of the existing agent-framework ecosystem (LangChain, LlamaIndex, CrewAI) lives there — this is the other half of the "Tier 0" SDK commitment from the platform strategy, deliberately built as its own phase rather than rushed alongside the TypeScript one.

## Goal

A Python package with the same feature set and semantics as `packages/agent-sdk`, idiomatic to Python rather than a mechanical port, verified against the same real running server the TypeScript SDK was verified against.

## Scope

1. **Package location and packaging.** A new directory (e.g. `packages/agent-sdk-python/` to stay consistent with the monorepo's `packages/*` convention, even though it's a different language toolchain) with a proper `pyproject.toml` — not published to PyPI yet, but structured as if it will be.
2. **Client surface, ported deliberately:**
   - `AgentMarketClient` — decide explicitly whether this is async-first with a sync wrapper (matching how `openai-python`/`httpx` handle it) or sync-first with an async variant. Given agent frameworks are increasingly async, async-first with a thin sync convenience wrapper is the more future-proof default — but make the call explicitly and document why in the package README, don't leave it implicit.
   - The `.call()` → `PendingCall`-equivalent fluent/thenable pattern doesn't translate literally (Python has no `then()`); use whatever reads as idiomatic Python for "a call with an optional fallback chain" — a builder returning `self` for `.fallback()`/`.with_retries()` that's `await`-able (or `.execute()`-terminated, if that reads more naturally in Python than an implicit await does) is fine. Match Python conventions over forcing symmetry with the TS API shape.
   - `PaymentScheme` protocol (Python's `Protocol`/ABC) with `MockPaymentScheme` and `AlgorandPaymentScheme` implementations.
   - `Budget` / shared budget, retry policy, `UsageTracker`, `discover()`, `estimate_cost()` — same semantics as the TS versions (see the "Decisions worth knowing" section of `packages/agent-sdk`'s docs for the retry-vs-payment-failure asymmetry in particular; port that reasoning exactly, don't simplify it away).
3. **Algorand payment scheme — check before committing to full parity.** The TS SDK's `AlgorandPaymentScheme` delegates all transaction-signing logic to `@x402-avm/avm`, an existing, presumably-vetted library implementing the exact atomic-group wire format the GoPlausible facilitator expects (see `packages/agent-sdk/src/payment/algorand-scheme.ts`'s doc comment). **Before writing any Python Algorand signing code, check whether an equivalent Python package for the x402-avm "exact" scheme already exists.** If it does, use it the same way the TS SDK does. If it doesn't, do not hand-roll Algorand atomic-group transaction construction from scratch under this phase's time pressure — that's exactly the kind of "reimplementing payment cryptography" the TS phase deliberately avoided. Ship the Python SDK with `MockPaymentScheme` fully working and `AlgorandPaymentScheme` either omitted with a clearly documented gap, or implemented using `py-algorand-sdk`'s primitives *only* if you can validate the resulting payload against the real facilitator's documented contract — don't guess at the wire format.
4. **Test harness.** Port `packages/agent-sdk/src/test-helpers/fake-server.ts`'s contract to Python (a `pytest` fixture or fake `httpx` transport) implementing the same 402/`X-PAYMENT` shape, so the same categories of test (successful payment, budget rejection, retry-on-transient-failure, fallback chains, caching) exist on both sides.

## Key files / patterns to follow

- Don't touch the TypeScript SDK's code — this is a new, separate package that happens to implement the same contract against the same server.
- The wire contract itself (what a 402 response looks like, what `X-PAYMENT` must contain, error response shapes) is defined by `packages/shared-types/src/payment.ts` and `packages/shared-types/src/errors.ts` on the TypeScript side — read those as the spec, don't infer the shape from the TS SDK's runtime behavior alone.

## Decisions to make explicit before coding

- Sync vs. async-first (above) — pick one, document it prominently in the README's first code example.
- Whether `AlgorandPaymentScheme` ships at all in this phase, partially, or is explicitly deferred — see point 3 above. Guessing at Algorand transaction signing to hit a deadline is a worse outcome than an honest gap.

## Acceptance criteria

- `pytest` suite passes, covering the same categories of behavior as `packages/agent-sdk/src/client.test.ts`: successful mock payment, budget enforcement (including a shared-budget case), transient-failure retry, non-retryable payment rejection, fallback chains (including the "single resource, no fallback configured — original error type surfaces, not a wrapper" case that the TS SDK's tests caught as a real bug), response caching, event stream ordering.
- A live smoke test against a real running AgentMarket server in mock-payment mode succeeds end to end (register no equivalent needed — just call a metered endpoint, confirm payment, fallback, and budget rejection against the server's *real* declared price, mirroring exactly how the TypeScript SDK was verified).

## Not in scope

- Publishing to PyPI.
- Any other language's SDK (Go, Rust, or the generated Java/C#/Kotlin/Swift clients) — those are lower-priority tiers per the platform strategy and not scheduled as their own phase yet.

## Depends on

Nothing structurally, though reading Phase 03's retrospective (`phases/phase-03-agent-sdk-typescript.md`) first will save time re-deriving decisions already made once.
