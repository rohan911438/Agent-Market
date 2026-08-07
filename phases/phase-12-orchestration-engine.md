# Phase 12 — Orchestration Engine

## Context

The platform strategy's redesign of the original "workflow builder" brief is explicit: **build the orchestration engine as an API/SDK primitive first, with any visual/no-code builder as a thin UI layer on top of it later** — because the actual buyer chaining multiple paid calls together is usually an agent, and agents don't drag boxes. This phase is that primitive: a stateless pipeline executor that runs several of AgentMarket's own metered endpoints in sequence, with a single upfront payment escrowed and released per completed step.

The example from the strategy doc: OCR → Translate → Summarize → Risk Analysis → Email, each step metered, with a partial refund if a step fails partway through. AgentMarket doesn't have OCR/Translate/Email endpoints today — use the real first-party endpoints that exist (`sentiment`, `risk-analysis`, `analyze`, `market-summary`, etc., see `apps/api/src/routes/*.route.ts`) for the actual implementation and tests; adapt the example conceptually, don't block on building unrelated new endpoints just to match the doc's illustration literally.

## Goal

`POST /v1/workflows/execute` running an ordered sequence of first-party calls, each step's output available to later steps, with correct upfront escrow sizing and correct partial-refund behavior on mid-pipeline failure.

## Scope

1. **Pipeline definition.** An ordered list of steps: `{ resource: string, params: Record<string, unknown> }`, where a param value can reference an earlier step's output via minimal templating (e.g. `"{{steps[0].output.fearGreedIndex}}"`). Keep the templating deliberately minimal — simple path substitution into a JSON structure, not a general expression language. Reject a pipeline referencing a step that doesn't exist or comes later, at validation time, before any payment is taken.
2. **The core architectural problem — solve this explicitly before writing route code:** each step's resource is normally gated by `createX402PreHandler` (`apps/api/src/middleware/x402-payment.ts`), which expects an external caller to present a fresh `X-PAYMENT` header per call. A multi-step pipeline needs the *engine itself* to satisfy each step's gate using the single upfront escrow, not by constructing N separate real payments. Design an internal settlement path — most likely a new `PaymentProvider`-like mode (see `packages/payments/src/payment-provider.interface.ts` for the existing shape) that debits an already-collected escrow ledger entry instead of verifying a signed payment — and use it *only* for engine-internal step execution, never reachable from a normal external request. Get this design reviewed/sanity-checked (in code comments, or by writing the test for "an external caller cannot reach the internal settlement path" first) before building the rest of the pipeline around it.
3. **Escrow sizing and collection.** Before executing anything, sum the *current* declared price of every step (probe each resource's price the same way `estimateCost` does in `packages/agent-sdk/src/cost-estimator.ts` — a 402 probe, not a hardcoded assumption) and require a single upfront payment covering the total, using the existing x402 gate on the `/v1/workflows/execute` endpoint itself.
4. **Partial refund on failure.** If step *N* fails, steps `0..N-1` have already completed successfully and each consumed its share of the escrow; steps `N..end` never ran and their share must be returned. Model this explicitly — a real refund path (there may not be one today; check `packages/payments` and `packages/database/src/repositories/payment.repository.ts` for what exists) needs designing here, not assumed to already exist.
5. **Response.** Return each step's output, the total charged, and (on partial failure) the refunded amount and which step failed — mirroring the diagram's "escrowed $0.10 upfront → step fails → refund remaining $0.01" mechanism concretely, with real numbers from the real steps run.

## Key files / patterns to follow

- New route module under `apps/api/src/routes/`, registered in `apps/api/src/routes/index.ts`.
- Reuse the existing route handlers for each step (the intelligence-computation logic in `apps/api/src/routes/*.route.ts`) rather than re-implementing sentiment/risk-analysis/etc. inside the orchestration engine — call the same underlying service functions the routes themselves call (`ctx.intelligenceEngine`, etc.), not a second copy of the logic.
- `packages/payments/src/payment-provider.interface.ts` for the shape a new internal escrow-settlement mode should probably follow, for consistency with `MockPaymentProvider`/`AlgorandX402Provider`.

## Decisions to make explicit before coding

- **The internal settlement mechanism (point 2 above) is the load-bearing design decision of this entire phase.** Do not start wiring routes before this is settled and written down — an insecure or accidentally-externally-reachable internal settlement path would be a real payment-security bug, not a cosmetic one.
- **Whether refunds are a real mechanism or a ledger adjustment.** If AgentMarket has no way to send money back on the current rails, "refund" may need to mean "credit toward a future call" or "reduce what was actually settled before final settlement" rather than reversing an already-completed on-chain transaction — figure out which is actually possible given the existing `packages/payments` capabilities before promising the diagram's literal behavior.

## Acceptance criteria

- A 3-step pipeline using real first-party endpoints (e.g. sentiment → risk-analysis → analyze, threading a symbol through) executes end to end against the mock payment provider, with the upfront escrow correctly equal to the sum of the three steps' real prices.
- A deliberately-failing middle step (inject a test fixture that makes step 2 of 3 fail) results in step 1's cost being consumed and step 3's cost being refunded/not charged — assert the exact amounts, not just "some refund happened."
- A test explicitly proves the internal settlement path cannot be triggered by a normal external request bypassing the pipeline executor.

## Not in scope

- The visual/drag-and-drop workflow builder UI — explicitly future work once this primitive is proven, per the platform strategy's own reasoning.
- Supporting third-party listings' `upstreamUrl` as pipeline steps — depends on the not-yet-built gateway; scope this phase to first-party endpoints only.
- General-purpose expression/templating language for step parameters — keep it minimal.

## Depends on

Nothing structurally new — payments infrastructure already exists (`packages/payments`), but this phase requires extending it, not just calling it as-is.
