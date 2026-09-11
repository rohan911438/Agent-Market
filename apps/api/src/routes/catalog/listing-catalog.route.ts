import { AppError } from '@agentmarket/shared-types';
import type { ApiListing } from '@prisma/client';
import type { FastifyInstance } from 'fastify';
import type { AppContext } from '../../context.js';
import { buildPostmanCollection } from '../../services/postman-collection.js';
import { renderSwaggerUiHtml } from './swagger-ui.js';

/** Published + has a validated spec on file — anything else 404s rather than serving a broken docs page. */
async function loadPublishedListingWithSpec(ctx: AppContext, slug: string): Promise<ApiListing & { parsedOpenApiSpec: string }> {
  const listing = await ctx.db.apiListings.findBySlug(slug);
  if (!listing || listing.status !== 'published') {
    throw new AppError('NOT_FOUND', `No published listing found with slug "${slug}".`, 404);
  }
  if (!listing.parsedOpenApiSpec) {
    throw new AppError('NOT_FOUND', `Listing "${slug}" doesn't have an OpenAPI spec on file.`, 404);
  }
  return listing as ApiListing & { parsedOpenApiSpec: string };
}

/**
 * Third-party equivalent of first-party-catalog.route.ts. Every published
 * listing with a spec gets the same docs/postman treatment a first-party
 * endpoint does — the "one gateway, one discovery surface" symmetry Phase 4
 * is about, not a second-class experience for provider-supplied APIs.
 */
export function registerListingCatalogRoutes(server: FastifyInstance, ctx: AppContext): void {
  server.get('/v1/listings/:slug/openapi.json', async (request) => {
    const { slug } = request.params as { slug: string };
    const listing = await loadPublishedListingWithSpec(ctx, slug);
    const document = JSON.parse(listing.parsedOpenApiSpec) as Record<string, unknown>;
    return { ...document, servers: [{ url: listing.upstreamUrl }] };
  });

  server.get('/v1/listings/:slug/docs', async (request, reply) => {
    const { slug } = request.params as { slug: string };
    await loadPublishedListingWithSpec(ctx, slug);
    reply.header('content-type', 'text/html; charset=utf-8');
    return renderSwaggerUiHtml(`${slug} — API Docs`, `/v1/listings/${slug}/openapi.json`);
  });

  server.get('/v1/listings/:slug/postman.json', async (request, reply) => {
    const { slug } = request.params as { slug: string };
    const listing = await loadPublishedListingWithSpec(ctx, slug);
    const document = JSON.parse(listing.parsedOpenApiSpec) as Record<string, unknown>;
    const collection = buildPostmanCollection(document, { name: listing.name, baseUrl: listing.upstreamUrl });
    reply.header('content-disposition', `attachment; filename="${slug}.postman_collection.json"`);
    return collection;
  });
}
