# Phase 09 — Analytics

## Context

Phase 07 (Revenue Platform) gives providers a financial view. This phase gives them an operational one: real-time usage, latency, failure rate, cache hit rate, payment success rate, and top endpoints/customers, for *their own* listings specifically. AgentMarket already logs this kind of data for first-party endpoints via `ApiRequest` (`packages/database/prisma/schema.prisma`) on every metered call (see `apps/api/src/routes/register-metered-route.ts`'s `onResponse` hook) — this phase extends that same logging to be queryable per third-party listing, not a parallel system.

**Same honesty note as Phase 07:** third-party listings have no real traffic until the gateway exists. Build the aggregation, API, and UI now so they're correct the instant traffic starts flowing; don't fabricate sample data to make the dashboard look populated.

## Goal

A provider-facing analytics view backed by real (if currently sparse) call-level data, sharing its data model with Phase 07 rather than duplicating it.

## Scope

1. **Reuse, don't duplicate, the `listingId` column.** If Phase 07 already added `listingId` to `ApiRequest` for revenue attribution, this phase reads the *same* column — do not add a second, parallel tracking mechanism. If Phase 07 hasn't happened yet, this phase should add that column itself and flag to Phase 07 (via updating its phase file or a shared note) that the column already exists.
2. **Aggregation.** `GET /v1/providers/me/analytics?listingId=&range=` (provider-authenticated, same middleware as every other control-plane route) returning time-bucketed usage count, average/p95 latency, error rate, cache hit rate, and payment success rate over the requested range. Compute this from `ApiRequest` rows directly for v1 — don't build a separate pre-aggregated rollup table unless query performance actually demands it (it won't, at this data volume).
3. **Top endpoints / top customers.** "Top endpoints" only matters once a provider has more than one listing — group by `listingId`. "Top customers" means top wallet addresses by call volume/spend against that provider's listings — read from `ApiRequest.walletId`, joined through to `Wallet.address` (see `packages/database/src/repositories/wallet.repository.ts`).
4. **UI.** An "Analytics" tab on `/provider`, alongside Revenue (Phase 07) — reuse the same dashboard shell/tab structure so the two feel like one coherent dashboard, not two bolted-together features. A table is sufficient for v1; if charts are added, load the `dataviz` skill first for palette/typography guidance rather than improvising chart colors.

## Key files / patterns to follow

- New repository methods on the existing `ApiRequestRepository` (`packages/database/src/repositories/api-request.repository.ts`) rather than a new repository class, since this phase queries the same table Phase 07 (and the existing first-party logging) already writes to.
- Route auth via `createProviderAuthPreHandler`, same as every other control-plane route.

## Decisions to make explicit before coding

- **Time bucketing granularity** — hourly buckets for a 24h range, daily buckets for a 30-day range, is a reasonable default; pick something and be explicit about it in the API response shape (e.g. `{bucket: 'hour', points: [...]}`) rather than a fixed-resolution array the caller has to guess the meaning of.
- **What "payment success rate" means precisely** — successful settlements over total payment *attempts* (including rejected ones), not over total requests (which would conflate free 402 probes with real attempts). Get this definition right; it's easy to compute a misleading percentage by accident.

## Acceptance criteria

- Zero-state renders correctly for a provider with no traffic (no error, no NaN percentages).
- Given seeded `ApiRequest` fixtures with a `listingId`, the endpoint returns correctly-bucketed, correctly-computed metrics — write this as a test with hand-constructed fixtures where you know the expected numbers in advance, not just "it returns something."
- Payment success rate is computed against attempts, not raw request volume — assert this distinction explicitly in a test with a mix of successful and rejected payment attempts.

## Not in scope

- Real-time streaming updates (polling on dashboard load/refresh is fine).
- Anomaly detection or alerting on metric thresholds.
- A pre-aggregated rollup/warehouse table — not justified at this data volume.

## Depends on

Phase 07, for the shared `listingId` column — coordinate rather than duplicate if both are in flight (see Phase 07's own notes on this same dependency).
