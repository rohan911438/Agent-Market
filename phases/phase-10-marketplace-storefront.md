# Phase 10 — Marketplace Storefront

## Context

`/marketplace` (`apps/web/src/app/marketplace/page.tsx`) currently lists every catalog entry (first-party endpoints plus published third-party listings, merged in `apps/api/src/routes/marketplace.route.ts`) as a flat, searchable, sortable grid. The platform strategy calls for a real storefront: Featured, Trending, Recently Added, Verified, Enterprise Ready, New — organized *surfaces*, not just filters on one flat list — while keeping the underlying principle from Phase 01/02 intact: **the storefront is a read view over the same discovery API an agent queries directly, not a CMS with its own diverging opinions.**

This phase assumes Phase 08 (Trust & Verification) is done, since "Verified"/"Enterprise Ready" need real `providerTrustScore`/`providerVerificationTier` fields to filter on, not placeholder badges.

## Goal

A marketplace page organized into the strategy doc's labeled sections, computed from real fields already in (or added by) the API response — no new parallel content-management surface.

## Scope

1. **Computed fields on the existing `/v1/marketplace` response**, not a new endpoint: `isNew` (published within, say, the last 14 days — compute from `publishedAt`), and reuse Phase 08's `providerVerificationTier` for "Verified"/"Enterprise Ready" filtering. "Trending" needs call-volume data — if Phase 09 (Analytics) is done, use real 7-day call counts; if not, degrade to ordering by `publishedAt` and label the section "Recently Added" instead of faking a "Trending" signal with no data behind it. Don't ship a trending section that's secretly random or hardcoded.
2. **Reorganize the marketplace page into sections** (`apps/web/src/app/marketplace/page.tsx`) — Featured (curated, see Collections below), Trending/Recently Added, Verified, Enterprise Ready, New — as distinct labeled shelves or filter chips, reusing the existing `Card`/`Badge` components. Keep the existing search/category/sort controls; this is additive organization, not a replacement for them.
3. **Rating/review schema placeholders only.** Add nullable `avgRating`/`reviewCount` fields to `ApiListing` (`packages/database/prisma/schema.prisma`), defaulting to `null`/`0`, surfaced in the API response — but do **not** build a review submission flow in this phase. Reviews need a consumer identity model (who's allowed to review a listing they've actually called?) that doesn't exist yet; inventing one under this phase's scope would be exactly the kind of half-built feature to avoid. Render "No reviews yet" honestly in the UI rather than a fake 5-star placeholder.
4. **Collections.** A `Collection` model (name, description, ordered list of listing ids) — admin/operator-curated for v1, not self-service (no UI for providers to submit themselves into a collection) — rendered as a horizontal shelf ("Featured") on the marketplace page. A direct DB seed or an authenticated admin endpoint is sufficient to populate one; don't build curator tooling beyond that.
5. **Pricing-model display.** `ApiListing.pricingModel` already supports `pay_per_call` / `subscription` / `bundle` (Phase 01), but the UI has only ever shown "$X / call." Make a `subscription`-priced listing display "$X / month" (or whatever unit makes sense) instead of the misleading "/ call" — this is a display fix, not new billing logic; actual recurring billing infrastructure is out of scope.

## Key files / patterns to follow

- Extend `apps/api/src/routes/marketplace.route.ts`'s response shape and `packages/shared-types/src/marketplace.ts`'s `MarketplaceApiSchema` — both already took a similar additive-optional-fields approach when third-party listings were merged in (Phase 01); follow that precedent rather than introducing a second response shape.
- New `Collection` repository under `packages/database/src/repositories/`, migrated per the established discipline.

## Decisions to make explicit before coding

- **What "Trending" means when Phase 09 hasn't shipped yet.** Don't block this phase on Phase 09 — decide the graceful-degradation behavior explicitly (falls back to recency ordering, section relabeled) rather than leaving a section that's quietly wrong.
- **How many listings before sections make sense.** With ~10 total catalog entries today, every section will look sparse — that's fine and expected at this stage; build the mechanism correctly rather than tuning thresholds for a catalog size that doesn't exist yet.

## Acceptance criteria

- Marketplace page renders all sections correctly against the real seeded data (the existing 8 first-party + 2–3 third-party demo listings from Phase 01), including a section explicitly showing "no results" gracefully rather than breaking when a filter has zero matches.
- A listing's `avgRating`/`reviewCount` render as an honest empty state, not a fabricated value.
- A `subscription`-priced listing displays its unit correctly (verified by a test fixture with `pricingModel: 'subscription'`).

## Not in scope

- User-submitted reviews/ratings (schema placeholders only — see point 3).
- Self-service collection curation.
- Actual subscription billing (recurring charges, proration, cancellation) — display-only fix for pricing model labels.

## Depends on

Phase 08 (trust/verification fields for the Verified/Enterprise sections). Soft dependency on Phase 09 (Trending data) — degrade gracefully if it isn't done yet rather than blocking on it.
