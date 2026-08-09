import type { ProviderAccountView } from '@agentmarket/shared-types';
import type { ProviderAccount } from '@prisma/client';
import type { ProviderTrustSummary } from './trust-score.js';

/**
 * Shared between provider-account.route.ts (the account's own view) and
 * routes/admin/provider-verification.route.ts (the admin action's response)
 * so both render the trust ladder identically instead of drifting.
 */
export function toProviderAccountView(account: ProviderAccount, trust: ProviderTrustSummary): ProviderAccountView {
  return {
    id: account.id,
    name: account.name,
    email: account.email,
    status: account.status as ProviderAccountView['status'],
    verifiedAt: account.verifiedAt ? account.verifiedAt.toISOString() : null,
    verificationTier: trust.verificationTier,
    trustScore: trust.trustScore,
  };
}
