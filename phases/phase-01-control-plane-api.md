# Phase 01 — Control-Plane API ✅ Done

## What shipped

The supply-side pipeline from the strategy doc's publishing diagram (Register → Verify → Upload → Configure pricing → Configure payment → Publish → Live on Marketplace), as a real HTTP API:

- `POST /v1/providers/register` — free, returns a one-time API key (only its SHA-256 hash is stored)
- `POST /v1/providers/verify` — account-level gate with a real anti-sybil check (rejects a wallet already verified under a different account)
- `POST /v1/providers/api-key/rotate`
- `POST /v1/listings`, `GET /v1/listings`, `GET /v1/listings/:id`
- `PATCH /v1/listings/:id/pricing`, `PATCH /v1/listings/:id/payment`
- `POST /v1/listings/:id/publish` — a requirements gate (`apps/api/src/services/listing-publish-gate.ts`) that reports every unmet condition at once instead of failing one at a time
- `GET /v1/marketplace` now merges first-party endpoints with published third-party listings into one feed

## Where it lives

- Schema: `packages/database/prisma/schema.prisma` (`ProviderAccount`, `ApiListing`)
- Repositories: `packages/database/src/repositories/provider-account.repository.ts`, `api-listing.repository.ts`
- Routes: `apps/api/src/routes/control-plane/`
- Auth: `apps/api/src/middleware/provider-auth.ts`, `apps/api/src/services/provider-api-key.ts`
- Types: `packages/shared-types/src/control-plane.ts`
- Tests: `apps/api/test/control-plane.integration.test.ts`, plus unit tests for the API key service and publish gate

## Decisions worth knowing before extending this

- **Third-party listings are a separate table from `MarketplaceApi`** (the legacy first-party catalog), merged only at read time in `marketplace.route.ts`. Don't try to unify the two tables — they have genuinely different lifecycles (we operate first-party endpoints directly; third-party ones are just brokered).
- **Third-party listings show `status: 'beta'` in the marketplace feed regardless of their own status**, because nothing proxies traffic to `upstreamUrl` yet — the gateway that would make `'live'` honest is Phase 12 (Orchestration) or later infrastructure work, not this phase.
- **The publish gate is a pure function** (`evaluatePublishGate`) taking plain data, not the database — keep it that way; it's what makes it unit-testable without a DB and reusable from a future dashboard "preview" feature.
- **Wallet-address validation is format-only** (58-char base32 regex), not checksum or ownership verification. A real KYC/identity provider integration belongs in Phase 08 (Trust & Verification), not here.
