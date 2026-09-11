# Developer Guide

## Adding a new metered endpoint

1. Add request/response zod schemas to `packages/shared-types/src/intelligence.ts`
   (or a new file), export from `index.ts`.
2. If it needs new signal math, add a pure function to
   `packages/intelligence-engine/src/stages/` and a unit test alongside it.
3. Create `apps/api/src/routes/<name>.route.ts` following the existing pattern — every
   route is registered through `registerMeteredRoute()`
   (`apps/api/src/routes/register-metered-route.ts`), which wires validation → rate
   limiting → the x402 payment gate → caching → audit logging in one place. Don't
   hand-roll any of that per route.
4. Register it in `apps/api/src/routes/index.ts`.
5. Add a `MarketplaceApi` row to `packages/database/prisma/seed.ts`.
6. Add it to the `ENDPOINTS` list in `apps/web/src/app/explorer/page.tsx` and the
   landing page's endpoint grid.
7. Add an integration test in `apps/api/test/` (see `analyze.integration.test.ts` for
   the pattern — build a test context, hit the route via `server.inject()`, assert the
   402 and 200 paths).

## Adding a new market-data provider

1. Implement the relevant capability interface(s) from
   `packages/providers/src/types.ts` (`PriceProviderAdapter`, `OhlcProviderAdapter`,
   etc.) in `packages/providers/src/adapters/<name>.adapter.ts`.
2. If it needs an API key, accept it via constructor and return `false` from
   `isAvailable()` when unset — **never throw or block boot** on a missing optional key.
3. Register it in `packages/providers/src/factory.ts`'s `createProviderRegistry()`, in
   fallback order (most reliable/richest first).
4. Add a `Provider` row to the seed script.

## Adding a new payment provider

1. Implement `PaymentProvider` (`packages/payments/src/payment-provider.interface.ts`) —
   `getRequirements`, `verify`, `settle`.
2. Register it in `packages/payments/src/factory.ts`'s `createPaymentProviderRegistry()`.
3. Point `PAYMENT_PROVIDER` at its `id` via config. No route or middleware code changes.

## Code organization rules

- Route handlers never call Prisma directly — go through `Database`
  (`packages/database`)'s repository classes.
- Route handlers never call `fetch()` for an upstream provider directly — go through
  `ApiProviderRegistry`.
- No package reaches for `process.env` directly except `packages/secrets` and
  `packages/config` — everything else receives config via constructor/parameter
  injection (see `apps/api/src/build-context.ts`, the app's single composition root).
- Every pipeline stage in `intelligence-engine` is a pure function with no I/O — the
  only stage that touches the network is `collectMarketData`.

## Running things individually

```bash
npm run dev --workspace=@agentmarket/api     # backend only
npm run dev --workspace=@agentmarket/web     # frontend only
npm test --workspace=@agentmarket/intelligence-engine
```
