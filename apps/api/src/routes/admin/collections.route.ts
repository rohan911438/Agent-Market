import { UpsertCollectionRequestSchema, type CollectionView } from '@agentmarket/shared-types';
import type { Collection } from '@prisma/client';
import type { FastifyInstance } from 'fastify';
import type { AppContext } from '../../context.js';
import { createAdminAuthPreHandler } from '../../middleware/admin-auth.js';

function toView(collection: Collection): CollectionView {
  return {
    id: collection.id,
    slug: collection.slug,
    name: collection.name,
    description: collection.description,
    listingIds: JSON.parse(collection.listingIds) as string[],
    position: collection.position,
  };
}

/**
 * Admin-only curation of marketplace shelves (Phase 10) — e.g. "Featured".
 * Deliberately no self-service UI for providers to submit themselves into a
 * collection; `listingIds` isn't validated for existence here (see
 * marketplace.route.ts, which resolves them against the live catalog and
 * silently skips anything dangling), so this stays a dumb upsert rather
 * than curator tooling.
 */
export function registerCollectionsAdminRoutes(server: FastifyInstance, ctx: AppContext): void {
  const requireAdminAuth = createAdminAuthPreHandler(ctx);

  server.post('/v1/admin/collections', { preHandler: requireAdminAuth }, async (request, reply) => {
    const input = UpsertCollectionRequestSchema.parse(request.body);

    const collection = await ctx.db.collections.upsertBySlug(input);
    await ctx.db.auditLogs.record({
      actorType: 'admin',
      action: 'collection.upserted',
      metadata: { slug: input.slug, listingCount: input.listingIds.length },
    });

    reply.code(200);
    return toView(collection);
  });
}
