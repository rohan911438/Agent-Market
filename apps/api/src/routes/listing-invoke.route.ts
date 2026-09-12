import { AppError } from '@rohankumar4179/shared-types';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import type { AppContext } from '../context.js';
import { buildUpstreamRequest, invokeUpstreamListingCached, resolveListingOperation } from '../services/listing-invocation.js';
import type { MeteredHandlerResult } from './register-metered-route.js';
import { registerMeteredRoute } from './register-metered-route.js';

export const InvokeListingParamsSchema = z.object({ slug: z.string().min(1) });
export const InvokeListingBodySchema = z.object({
  operationId: z.string().min(1),
  params: z.record(z.string(), z.unknown()).default({}),
});
export type InvokeListingBody = z.infer<typeof InvokeListingBodySchema>;

async function requirePublishedListing(ctx: AppContext, slug: string) {
  const listing = await ctx.db.apiListings.findBySlug(slug);
  if (!listing || listing.status !== 'published') {
    throw new AppError('NOT_FOUND', `No published listing "${slug}".`, 404);
  }
  // Publishing requires pricing to be configured (see listing-publish-gate.ts)
  // — priceUsd is nullable only pre-publish, so this never actually fires for
  // a status==='published' row, but keeps the type (number | null) honest.
  if (listing.priceUsd === null) {
    throw new AppError('PROVIDER_UNAVAILABLE', `Listing "${slug}" has no price configured.`, 502);
  }
  return { ...listing, priceUsd: listing.priceUsd };
}

export async function listingInvokeHandler(
  ctx: AppContext,
  { body, request }: { body: InvokeListingBody; request: FastifyRequest },
): Promise<MeteredHandlerResult<unknown>> {
  const { slug } = InvokeListingParamsSchema.parse(request.params);
  const listing = await requirePublishedListing(ctx, slug);

  const result = await invokeUpstreamListingCached(ctx.cache, listing, body.operationId, body.params);
  if (result.statusCode >= 400) {
    throw new AppError(
      'PROVIDER_UNAVAILABLE',
      `Listing "${slug}" returned HTTP ${result.statusCode} for operation "${body.operationId}".`,
      502,
      { upstreamStatusCode: result.statusCode, upstreamBody: result.body },
    );
  }

  return { body: result.body, cacheHit: result.cacheHit, providers: [listing.slug] };
}

/**
 * Executes one operation of a published third-party listing — the gateway
 * `services/workflow-step-registry.ts` explicitly deferred ("third-party
 * listings' `upstreamUrl` are deliberately excluded — that depends on the
 * not-yet-built gateway"). Built now so the MCP tool executor
 * (services/mcp-tool-executor.ts) can invoke third-party tools the same way
 * it invokes first-party ones: `server.inject` into a real, x402-metered
 * REST route, never a second payment/execution path. This route is equally
 * usable directly over HTTP by any caller, MCP or not — it's a first-class
 * AgentMarket capability, not MCP-only plumbing.
 *
 * Priced per-listing (`listing.priceUsd`), which isn't known until `:slug`
 * is read from the URL — see register-metered-route.ts's `resolveMeta`.
 */
export function registerListingInvokeRoute(server: FastifyInstance, ctx: AppContext): void {
  registerMeteredRoute({
    server,
    ctx,
    method: 'POST',
    url: '/v1/listings/:slug/invoke',
    resource: '/v1/listings/:slug/invoke', // fallback label only — resolveMeta below always supplies the real per-listing resource/price
    priceUsd: 0,
    bodySchema: InvokeListingBodySchema,
    resolveMeta: async (request) => {
      const { slug } = InvokeListingParamsSchema.parse(request.params);
      const listing = await requirePublishedListing(ctx, slug);

      // Resolves the operation and builds the real upstream request now
      // (unknown operationId, missing required params, or an upstream that
      // fails the SSRF guard all throw AppError here) — the "fail free
      // before payment" principle register-metered-route.ts's preValidation
      // already applies to schema errors extends to this listing-specific
      // validation too. The built request itself is discarded; the handler
      // rebuilds it after payment settles, which is cheap (no I/O) and
      // avoids threading it through paymentContext for a one-time save.
      const body = request.validated?.body as InvokeListingBody;
      const operation = resolveListingOperation(listing, body.operationId);
      buildUpstreamRequest(listing, operation, body.params);

      return { resource: `listing:${listing.slug}`, priceUsd: listing.priceUsd, listingId: listing.id };
    },
    handler: (args) => listingInvokeHandler(ctx, args),
  });
}
