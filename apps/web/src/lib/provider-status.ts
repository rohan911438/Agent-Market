export type BadgeTone = 'success' | 'warning' | 'danger' | 'default' | 'accent' | 'info';

export function providerStatusBadge(status: string): { tone: BadgeTone; label: string } {
  switch (status) {
    case 'verified':
      return { tone: 'success', label: 'Verified' };
    case 'pending':
      return { tone: 'warning', label: 'Pending verification' };
    case 'suspended':
      return { tone: 'danger', label: 'Suspended' };
    default:
      return { tone: 'default', label: status };
  }
}

export function listingStatusBadge(status: string): { tone: BadgeTone; label: string } {
  switch (status) {
    case 'published':
      return { tone: 'success', label: 'Published' };
    case 'draft':
      return { tone: 'default', label: 'Draft' };
    case 'suspended':
      return { tone: 'danger', label: 'Suspended' };
    default:
      return { tone: 'default', label: status };
  }
}

/**
 * The verification ladder (Phase 8) — distinct from `status` above.
 * "unverified" renders no badge (returns null) rather than a noisy default
 * one, since it's the common/default state, not a signal worth calling out.
 */
export function verificationTierBadge(tier: string): { tone: BadgeTone; label: string } | null {
  switch (tier) {
    case 'verified_enterprise':
      return { tone: 'accent', label: 'Verified Enterprise' };
    case 'verified':
      return { tone: 'info', label: 'Verified' };
    default:
      return null;
  }
}
