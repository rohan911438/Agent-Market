# Phase 08 — Trust & Verification Ladder

## Context

Phase 01 built a minimal two-and-a-half-state provider status (`pending` / `verified` / `suspended`) with a real but narrow check: `POST /v1/providers/verify` rejects a wallet address already verified under a different account (see `packages/database/src/repositories/provider-account.repository.ts`'s `findVerifiedByWalletAddress`, and the reasoning in `phases/phase-01-control-plane-api.md`). The platform strategy calls for a graduated ladder — Unverified → Verified → Verified Enterprise — where each rung unlocks something (ranking eligibility, a badge, a higher default trust ceiling), and critically, the trust signal has to be a field in API responses an agent can filter on programmatically, not just a badge rendered for humans.

## Goal

A real graduated verification ladder with a machine-readable trust score, exposed everywhere a listing or provider already appears in an API response.

## Scope

1. **Add a `verificationTier` distinct from operational `status`.** `status` (pending/verified/suspended) governs whether the account can operate at all; `verificationTier` (e.g. `unverified` / `verified` / `verified_enterprise`) governs how much it's trusted. Don't conflate the two — a suspended account's tier doesn't matter, but a merely-pending account and a fully-audited enterprise account are both "not suspended" and need to be distinguishable.
2. **A trust score.** A `trustScore` (integer, 0–100) computed from signals already sitting in the database: account age, number of published listings, publish success rate (how often `POST .../publish` succeeds on first try — pulled from `AuditLog` records with action `listing.publish_rejected` vs `listing.published`, see `apps/api/src/routes/control-plane/listings.route.ts`), and whether any listing has ever been suspended. Write this as a pure, documented, tested function (same discipline as `evaluatePublishGate` in `apps/api/src/services/listing-publish-gate.ts`) — this is v1, rules-based, explicitly *not* a black box, and should say so in a code comment so nobody mistakes it for something more sophisticated than it is.
3. **"Verified Enterprise" tier.** Requires everything "Verified" requires, plus a `securityAuditPassedAt` timestamp on `ProviderAccount` that's set by a new admin-only action (no real third-party audit integration exists — a simple authenticated-as-admin endpoint or even a direct DB flag for now is fine; document explicitly that this is a manual operator action, not an automated check).
4. **Expose it everywhere a listing appears.** Add `providerTrustScore` and `providerVerificationTier` to the `ApiListingView` (`packages/shared-types/src/control-plane.ts`) and to the merged `/v1/marketplace` response (`apps/api/src/routes/marketplace.route.ts`) — the strategy doc's explicit requirement is that an agent's SDK can filter on trust *without* rendering a webpage, so this has to be real response JSON, not just something the frontend badge component reads from elsewhere.
5. **UI badges.** Verified / Verified Enterprise badges on `/provider` (the account's own view) and on the public `/marketplace` listing cards (`apps/web/src/app/marketplace/page.tsx`), reusing the existing `Badge` component's tone system.

## Key files / patterns to follow

- Schema change in `packages/database/prisma/schema.prisma`, migrated per Phase 01's discipline (throwaway DB → generate → `migrate deploy` on the real one).
- The trust-score function belongs in `apps/api/src/services/`, alongside `listing-publish-gate.ts`, not inline in a route handler — it needs to be unit-testable without a database, same as the publish gate.

## Decisions to make explicit before coding

- **Exact trust score formula and weights.** Pick specific, documented numbers (e.g. "+10 for every 30 days of account age, capped at 30; +5 per published listing, capped at 20; ...") rather than leaving it vague — a formula that isn't pinned down in code comments will drift or get reverse-engineered incorrectly later.
- **Who can set `securityAuditPassedAt`.** If there's no admin-role concept anywhere in the codebase yet (there isn't, as of Phase 01), decide whether to introduce a minimal one (an env-configured admin API key, checked the same way `provider-auth.ts` checks provider keys) rather than leaving the endpoint unauthenticated.

## Acceptance criteria

- Trust score computes deterministically and correctly from test fixtures covering each signal independently (age alone, listing count alone, a rejected publish attempt, a suspension) and combined.
- A provider account cannot reach `verified_enterprise` tier without `securityAuditPassedAt` set, verified by a test asserting the negative case, not just the positive one.
- `GET /v1/marketplace` includes `providerTrustScore`/`providerVerificationTier` on every third-party entry — assert this in a test reading the actual JSON response, the same way Phase 01's tests assert `isThirdParty`/`providerName`.

## Not in scope

- Real KYC/identity verification integration.
- Real third-party security audit integration (penetration test vendors, SOC2 checks, etc.) — the manual flag is the entire scope here.
- An admin UI for reviewing/approving audits — an authenticated endpoint is sufficient for v1.

## Depends on

Nothing to start. Phase 10 (Marketplace Storefront) and Phase 11 (AI Discovery) both read the trust score this phase produces — do this one first if multiple are queued.
