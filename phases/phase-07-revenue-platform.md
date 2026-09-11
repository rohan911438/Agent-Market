# Phase 07 — Revenue Platform

## Context

Providers can register, publish, and price listings (Phase 01) and manage them through a dashboard (Phase 02), but have zero visibility into what they're earning. `ApiListing` (`packages/database/prisma/schema.prisma`) already has `payoutWalletAddress` and `payoutSplitBps` (the provider's share of each settlement, default 8000 = 80%), but nothing computes or reports against them yet.

**Read this before scoping the work:** third-party listings aren't proxied to their `upstreamUrl` yet — there's no gateway (that's Phase 12-and-beyond infrastructure), so no real payment has ever actually flowed to a third-party listing. This phase's honest job is to build the ledger, schema, API, and UI *now*, so it's correct and ready the moment real traffic exists — not to fabricate revenue numbers or promise a "revenue dashboard" that's secretly empty by construction. Say this plainly in the UI's empty state rather than hiding it.

## Goal

A real revenue ledger and provider-facing dashboard section, correctly computing each provider's take-rate share of settled payments, that shows accurate zeros today and accurate numbers the moment the gateway starts routing real traffic.

## Scope

1. **Attribute payments to listings.** `Payment` and `ApiRequest` (`packages/database/prisma/schema.prisma`) are currently keyed by a `route` string, meaningful for first-party endpoints only. Add a nullable `listingId` (FK to `ApiListing`) to both, populated whenever the resource being called corresponds to a published third-party listing (a first-party call leaves it null — first-party revenue isn't "provider revenue," it's just AgentMarket's own).
2. **A `Payout` model** — `providerAccountId`, `amountUsd`, `status` (e.g. `pending`/`paid`), `periodStart`/`periodEnd`, `settledAt`. This is the ledger record, not a mechanism that moves real money — see "Not in scope" below.
3. **Take-rate computation.** Given a settled payment against a listing, the provider's share is `amountUsd * (listing.payoutSplitBps / 10000)`. Write this as a small, pure, tested function — it's exactly the kind of arithmetic that's easy to get backwards (bps vs. percentage, provider's share vs. platform's cut) under time pressure.
4. **API:** `GET /v1/providers/me/revenue` (provider-authenticated, same `provider-auth` middleware pattern as every other control-plane route — see `apps/api/src/middleware/provider-auth.ts`) returning: total earned, this-month total, a per-listing breakdown, and recent payout records.
5. **UI:** a "Revenue" section on `/provider` (`apps/web/src/app/provider/page.tsx` or a new sub-route, matching the existing tab/section conventions already there), using the existing `Card`/`Table`/`AnimatedCounter` components — don't introduce a new visual language for one dashboard tab.

## Key files / patterns to follow

- Repository pattern: a new `PayoutRepository` under `packages/database/src/repositories/`, wired into `Database` (`packages/database/src/database.ts`) exactly like every existing repository.
- Migration discipline from Phase 01: generate against a throwaway database, apply to the real one via `prisma migrate deploy`, baseline first if needed. Never `db push` against `apps/api/dev.db`.
- Route auth: reuse `createProviderAuthPreHandler`, don't write a second auth check.

## Decisions to make explicit before coding

- **Whether to add `listingId` to the existing `Payment`/`ApiRequest` tables or create parallel ones.** Extending the existing tables is very likely correct (avoids two divergent logging paths for what's conceptually the same event) — but Phase 09 (Analytics) probably wants the exact same column for the exact same reason. If both phases are being done, coordinate so the migration happens once, not twice with conflicting shapes.
- **What "this month" means across timezones** — pick UTC calendar months (consistent with how `apps/api/src/middleware/x402-payment.ts` already computes "daily spend" in UTC) rather than inventing a new convention.

## Acceptance criteria

- A provider with no traffic sees a correctly-rendered zero state, not an error or a blank screen.
- Given a test fixture that inserts a `Payment` row with a `listingId` and the listing's `payoutSplitBps`, the revenue API returns the correctly-computed provider share — write this as an explicit unit test of the take-rate function plus an integration test of the endpoint.
- The per-listing breakdown correctly aggregates multiple payments to the same listing.

## Not in scope

- **Actually moving money.** This phase builds the ledger and reporting only. Disbursing a real payout to a provider's `payoutWalletAddress` is a financial operation with its own correctness and security bar — do not wire up any code path that sends real funds as part of this phase without that being an explicit, separately-scoped, human-approved piece of work.
- Tax documents, invoices, 1099-equivalents.
- Refund/dispute handling beyond what already exists.

## Depends on

Nothing to start. Coordinate schema changes with Phase 09 if both are in flight (see the decision above) — otherwise independent.
