export type BadgeTone = 'success' | 'warning' | 'danger' | 'default';

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
