import type { PayoutView, RevenueListingBreakdown, RevenueSummaryView } from '@agentmarket/shared-types';
import type { Payout } from '@prisma/client';
import type { FastifyInstance } from 'fastify';
import type { AppContext } from '../../context.js';
import { createProviderAuthPreHandler } from '../../middleware/provider-auth.js';
import { currentUtcMonthStart, providerShareFromAtomic } from '../../services/revenue.js';

function toPayoutView(payout: Payout): PayoutView {
  return {
    id: payout.id,
    amountUsd: payout.amountUsd,
    status: payout.status as PayoutView['status'],
    periodStart: payout.periodStart.toISOString(),
    periodEnd: payout.periodEnd.toISOString(),
    settledAt: payout.settledAt ? payout.settledAt.toISOString() : null,
  };
}

/**
 * The provider-facing revenue ledger (Phase 07). Correctly computes each
 * provider's take-rate share of *settled* payments attributed to their own
 * listings — see revenue.ts for the take-rate arithmetic. Third-party
 * listings aren't proxied through a gateway yet (Phase 12+), so every
 * provider legitimately sees accurate zeros until real traffic exists; this
 * route never fabricates a number to look otherwise.
 */
export function registerProviderRevenueRoutes(server: FastifyInstance, ctx: AppContext): void {
  const requireProviderAuth = createProviderAuthPreHandler(ctx);

  server.get('/v1/providers/me/revenue', { preHandler: requireProviderAuth }, async (request) => {
    const account = request.providerAccount!;

    const [payments, payouts] = await Promise.all([
      ctx.db.payments.findSettledForProvider(account.id),
      ctx.db.payouts.listByProvider(account.id),
    ]);

    const monthStart = currentUtcMonthStart();
    const byListing = new Map<string, RevenueListingBreakdown>();
    let totalEarnedUsd = 0;
    let thisMonthUsd = 0;

    for (const payment of payments) {
      const shareUsd = providerShareFromAtomic(payment.amountAtomic, payment.listing.payoutSplitBps);
      totalEarnedUsd += shareUsd;
      if (payment.settledAt && payment.settledAt >= monthStart) {
        thisMonthUsd += shareUsd;
      }

      const existing = byListing.get(payment.listing.id);
      if (existing) {
        existing.totalUsd += shareUsd;
        existing.paymentCount += 1;
      } else {
        byListing.set(payment.listing.id, {
          listingId: payment.listing.id,
          slug: payment.listing.slug,
          name: payment.listing.name,
          totalUsd: shareUsd,
          paymentCount: 1,
        });
      }
    }

    const summary: RevenueSummaryView = {
      totalEarnedUsd,
      thisMonthUsd,
      listings: Array.from(byListing.values()),
      recentPayouts: payouts.map(toPayoutView),
    };
    return summary;
  });
}
