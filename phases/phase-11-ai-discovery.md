# Phase 11 — AI Discovery

## Context

`packages/agent-sdk`'s `discover()` (Phase 03; see `packages/agent-sdk/src/discovery.ts`) does exactly what its own doc comment says it does: "exact category match, a price ceiling, and a substring search... basic filtering, not the semantic/intent ranking the AI Discovery roadmap item describes." This phase builds that ranking layer — the platform strategy's example is an agent stating a job in natural language (`find_capability({ task: "flag wallets with elevated risk before a payout", constraints: {...} })`) and getting back ranked results, instead of constructing a keyword query by hand.

## Goal

A ranked-discovery endpoint that scores listings against a free-text task description plus explicit constraints, combining relevance, trust (Phase 08), operational fit (latency/price against constraints), and — where real data exists (Phase 09) — historical reliability. Stay honest about what "ranking" means at this stage: a documented, inspectable scoring formula, not a trained model.

## Scope

1. **`POST /v1/discover`** (public — this is a discovery primitive an agent calls before it's necessarily a paying customer of anything) accepting `{ task: string, constraints?: { maxLatencyMs?: number, maxCostPerCall?: number } }`, returning listings ranked best-to-worst with their score and a short reason (e.g. `{ listing, score, reasons: ["matches 'wallet risk'", "within cost constraint", "verified provider"] }` — the reasons array matters for trust in the ranking; don't return a bare number with no explanation).
2. **Relevance scoring.** Match `task` against each listing's `name` + `description` + `tags`. Before reaching for an embeddings API, check what's actually available/approved in this environment — don't assume network access to an external embeddings provider without confirming it. A term-overlap / TF-IDF-style scoring approach requires no external dependency and is a legitimate, honestly-scoped v1; upgrade to semantic embeddings later if/when that's actually available and worth the added dependency.
3. **Constraint fit.** Penalize (don't hard-exclude, unless the constraint is a hard requirement like a price ceiling) listings outside `maxLatencyMs`/`maxCostPerCall`. Use Phase 09's real latency data where it exists for a given listing; default neutrally (neither penalize nor reward) when it doesn't, rather than treating "no data" as "bad."
4. **Trust weighting.** Fold in Phase 08's `trustScore` as one term in the combined score — a lower-relevance but highly-trusted listing should be able to outrank a marginally-more-relevant but unverified one, but not by so much that relevance stops mattering. Pick and document specific weights.
5. **Document the formula in code, plainly.** This is meant to be replaced by something more sophisticated once real usage data exists at scale — write it so the next person can see exactly what it's doing and why, not as a black box.
6. **SDK integration.** Add `agent.findCapability({ task, constraints })` to `packages/agent-sdk` (`packages/agent-sdk/src/discovery.ts` or a new `capability-search.ts` alongside it), wrapping the new endpoint — matching the strategy doc's example naming. Export it from `packages/agent-sdk/src/index.ts` and document it in the package README's feature table.

## Key files / patterns to follow

- New route module under `apps/api/src/routes/`, registered in `apps/api/src/routes/index.ts`.
- The scoring function itself belongs in `apps/api/src/services/` as a pure, unit-testable function (same discipline as `listing-publish-gate.ts` and Phase 08's trust-score function) — it should be callable and testable with plain data, without spinning up the route or a database.

## Decisions to make explicit before coding

- **Whether any external embeddings/LLM API is actually available and approved for use here.** If genuinely unsure, default to the dependency-free term-overlap approach and say explicitly in the phase's implementation notes that semantic search was deferred pending that confirmation — don't silently wire up a call to an external service that might not be intended for this environment.
- **Exact scoring weights** — pin down specific numbers for relevance vs. trust vs. constraint-fit, the same way Phase 08 pins down its trust-score weights, rather than leaving "combine them somehow" vague.

## Acceptance criteria

- Given a task description closely matching an existing listing's description, that listing ranks first among a test catalog fixture with known expected ordering.
- A `maxCostPerCall` constraint correctly excludes or penalizes (per your documented choice) listings priced above it — assert both the inclusion and exclusion cases.
- `agent.findCapability(...)` round-trips correctly against a test server using the SDK's existing `fetchImpl` override pattern (see `packages/agent-sdk/src/client.test.ts` for the established testing style).

## Not in scope

- A trained or learned ranking model.
- Per-agent personalization.
- Precomputing/caching embeddings at scale — not justified at the current catalog size; compute at request time.

## Depends on

Phase 08 (trust score input). Soft dependency on Phase 09 (latency data) — degrade to neutral weighting if it isn't done yet, don't block on it.
