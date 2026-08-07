import {
  AppError,
  ConfigurePaymentRequestSchema,
  ConfigurePricingRequestSchema,
  CreateListingRequestSchema,
  type ApiListingView,
} from '@agentmarket/shared-types';
import type { ApiListing } from '@prisma/client';
import type { FastifyInstance } from 'fastify';
import type { AppContext } from '../../context.js';
import { createProviderAuthPreHandler } from '../../middleware/provider-auth.js';
import { evaluatePublishGate } from '../../services/listing-publish-gate.js';

function toView(listing: ApiListing): ApiListingView {
  return {
    id: listing.id,
    slug: listing.slug,
    name: listing.name,
    description: listing.description,
    category: listing.category,
    tags: JSON.parse(listing.tags) as string[],
    version: listing.version,
    upstreamUrl: listing.upstreamUrl,
    docsUrl: listing.docsUrl,
    pricingModel: listing.pricingModel as ApiListingView['pricingModel'],
    priceUsd: listing.priceUsd,
    payoutWalletAddress: listing.payoutWalletAddress,
    status: listing.status as ApiListingView['status'],
    publishedAt: listing.publishedAt ? listing.publishedAt.toISOString() : null,
  };
}

/** Loads a listing and throws NOT_FOUND for both "doesn't exist" and "not yours" — ownership is never leaked. */
async function loadOwnedListing(ctx: AppContext, id: string, providerAccountId: string): Promise<ApiListing> {
  const listing = await ctx.db.apiListings.findById(id);
  if (!listing || listing.providerAccountId !== providerAccountId) {
    throw new AppError('NOT_FOUND', 'No listing found with that id.', 404);
  }
  return listing;
}

/**
 * Upload -> Configure pricing -> Configure payment -> Publish — the rest of
 * the pipeline started in provider-account.route.ts. Every route here
 * requires a provider API key and only ever operates on that provider's own
 * listings.
 */
export function registerListingRoutes(server: FastifyInstance, ctx: AppContext): void {
  const requireProviderAuth = createProviderAuthPreHandler(ctx);

  server.post('/v1/listings', { preHandler: requireProviderAuth }, async (request, reply) => {
    const account = request.providerAccount!;
    const input = CreateListingRequestSchema.parse(request.body);

    const existing = await ctx.db.apiListings.findBySlug(input.slug);
    if (existing) {
      throw new AppError('CONFLICT', `A listing already exists with slug "${input.slug}".`, 409);
    }

    const listing = await ctx.db.apiListings.create({
      providerAccountId: account.id,
      slug: input.slug,
      name: input.name,
      description: input.description,
      category: input.category,
      tags: JSON.stringify(input.tags),
      upstreamUrl: input.upstreamUrl,
      openApiSpec: input.openApiSpec,
      docsUrl: input.docsUrl,
    });

    await ctx.db.auditLogs.record({
      actorType: 'provider_account',
      actorId: account.id,
      action: 'listing.created',
      metadata: { listingId: listing.id, slug: listing.slug },
    });

    reply.code(201);
    return toView(listing);
  });

  server.get('/v1/listings', { preHandler: requireProviderAuth }, async (request) => {
    const listings = await ctx.db.apiListings.listByProvider(request.providerAccount!.id);
    return { listings: listings.map(toView) };
  });

  server.get('/v1/listings/:id', { preHandler: requireProviderAuth }, async (request) => {
    const { id } = request.params as { id: string };
    const listing = await loadOwnedListing(ctx, id, request.providerAccount!.id);
    return toView(listing);
  });

  server.patch('/v1/listings/:id/pricing', { preHandler: requireProviderAuth }, async (request) => {
    const { id } = request.params as { id: string };
    const account = request.providerAccount!;
    await loadOwnedListing(ctx, id, account.id);
    const input = ConfigurePricingRequestSchema.parse(request.body);

    const listing = await ctx.db.apiListings.configurePricing(id, input);
    await ctx.db.auditLogs.record({
      actorType: 'provider_account',
      actorId: account.id,
      action: 'listing.pricing_configured',
      metadata: { listingId: id, ...input },
    });
    return toView(listing);
  });

  server.patch('/v1/listings/:id/payment', { preHandler: requireProviderAuth }, async (request) => {
    const { id } = request.params as { id: string };
    const account = request.providerAccount!;
    await loadOwnedListing(ctx, id, account.id);
    const input = ConfigurePaymentRequestSchema.parse(request.body);

    const listing = await ctx.db.apiListings.configurePayment(id, input);
    await ctx.db.auditLogs.record({
      actorType: 'provider_account',
      actorId: account.id,
      action: 'listing.payment_configured',
      metadata: { listingId: id },
    });
    return toView(listing);
  });

  server.post('/v1/listings/:id/publish', { preHandler: requireProviderAuth }, async (request) => {
    const { id } = request.params as { id: string };
    const account = request.providerAccount!;
    const listing = await loadOwnedListing(ctx, id, account.id);

    if (listing.status === 'published') {
      throw new AppError('CONFLICT', 'This listing is already published.', 409);
    }
    if (listing.status === 'suspended') {
      throw new AppError('CONFLICT', 'This listing is suspended and cannot be published.', 409);
    }

    const gate = evaluatePublishGate({
      providerAccountStatus: account.status,
      priceUsd: listing.priceUsd,
      payoutWalletAddress: listing.payoutWalletAddress,
      upstreamUrl: listing.upstreamUrl,
      description: listing.description,
    });

    if (!gate.ok) {
      await ctx.db.auditLogs.record({
        actorType: 'provider_account',
        actorId: account.id,
        action: 'listing.publish_rejected',
        metadata: { listingId: id, requirements: gate.requirements },
      });
      throw new AppError('PUBLISH_REQUIREMENTS_NOT_MET', 'This listing does not meet the publish requirements yet.', 422, {
        requirements: gate.requirements,
      });
    }

    const published = await ctx.db.apiListings.publish(id);
    await ctx.db.auditLogs.record({
      actorType: 'provider_account',
      actorId: account.id,
      action: 'listing.published',
      metadata: { listingId: id, slug: listing.slug },
    });
    return toView(published);
  });
}
