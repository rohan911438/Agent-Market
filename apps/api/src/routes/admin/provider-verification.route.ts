import { AppError } from '@rohankumar4179/shared-types';
import type { FastifyInstance } from 'fastify';
import type { AppContext } from '../../context.js';
import { createAdminAuthPreHandler } from '../../middleware/admin-auth.js';
import { toProviderAccountView } from '../../services/provider-account-view.js';
import { computeProviderTrust } from '../../services/trust-score.js';

/**
 * Admin-only actions on the verification ladder. As of Phase 08 this is a
 * single manual flag: no real third-party security-audit vendor is
 * integrated (no SOC2/pentest API call happens here) — an operator who has
 * reviewed a provider out-of-band hits this endpoint to record that fact.
 * See trust-score.ts for how this flag feeds into `verificationTier`.
 */
export function registerProviderVerificationAdminRoutes(server: FastifyInstance, ctx: AppContext): void {
  const requireAdminAuth = createAdminAuthPreHandler(ctx);

  server.post('/v1/admin/providers/:id/security-audit', { preHandler: requireAdminAuth }, async (request) => {
    const { id } = request.params as { id: string };

    const account = await ctx.db.providerAccounts.findById(id);
    if (!account) {
      throw new AppError('NOT_FOUND', 'No provider account found with that id.', 404);
    }

    const updated = await ctx.db.providerAccounts.setSecurityAuditPassed(id);
    await ctx.db.auditLogs.record({
      actorType: 'admin',
      action: 'provider_account.security_audit_passed',
      metadata: { providerAccountId: id },
    });

    return toProviderAccountView(updated, await computeProviderTrust(ctx, updated));
  });
}
