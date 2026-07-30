import { AppError } from '@agentmarket/shared-types';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { AppContext } from '../context.js';

const QuerySchema = z.object({ wallet: z.string().min(1) });

/** Free — the frontend Dashboard reads this rather than hitting Prisma directly from the client. */
export function registerDashboardRoute(server: FastifyInstance, ctx: AppContext): void {
  server.get('/v1/dashboard', async (request) => {
    const { wallet } = QuerySchema.parse(request.query);
    const walletRow = await ctx.db.wallets.findByAddress(wallet);
    if (!walletRow) {
      throw new AppError('NOT_FOUND', 'No activity found for this wallet yet.', 404);
    }

    const [usage, recentRequests] = await Promise.all([
      ctx.db.usage.summaryForWallet(walletRow.id),
      ctx.db.apiRequests.recentForWallet(walletRow.id, 50),
    ]);

    const totalSpendUsd = usage.reduce((sum, row) => sum + row.spendUsd, 0);
    const totalRequests = usage.reduce((sum, row) => sum + row.requestCount, 0);

    return {
      wallet: { address: walletRow.address, network: walletRow.network, isVerified: walletRow.isVerified },
      totalSpendUsd,
      totalRequests,
      usage,
      recentRequests,
    };
  });
}
