import type { FastifyInstance } from 'fastify';
import type { AppContext } from '../context.js';

/** Free — lists every metered endpoint, its price, and live/beta status. Powers the marketplace/pricing pages. */
export function registerMarketplaceRoute(server: FastifyInstance, ctx: AppContext): void {
  server.get('/v1/marketplace', async () => {
    const apis = await ctx.db.marketplaceApis.list();
    return { apis };
  });
}
