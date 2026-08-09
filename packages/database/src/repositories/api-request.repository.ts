import type { ApiRequest, PrismaClient, Wallet } from '@prisma/client';

export interface CreateApiRequestInput {
  requestId: string;
  route: string;
  method: string;
  ipAddress: string;
  walletId?: string;
  userId?: string;
  paymentId?: string;
  providerUsed?: string;
  cacheHit: boolean;
  statusCode: number;
  latencyMs: number;
  errorCode?: string;
  /** Set only when this request called a published third-party listing. */
  listingId?: string;
}

export type ProviderApiRequestRow = ApiRequest & { wallet: Wallet | null };

export class ApiRequestRepository {
  constructor(private readonly prisma: PrismaClient) {}

  create(input: CreateApiRequestInput): Promise<ApiRequest> {
    return this.prisma.apiRequest.create({ data: input });
  }

  countSince(walletId: string, since: Date): Promise<number> {
    return this.prisma.apiRequest.count({ where: { walletId, createdAt: { gte: since } } });
  }

  recentForWallet(walletId: string, limit = 50): Promise<ApiRequest[]> {
    return this.prisma.apiRequest.findMany({
      where: { walletId },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
  }

  /**
   * Every request against a provider's own listings since a given time —
   * the source rows for the analytics dashboard (Phase 9). Reuses the same
   * `listingId` column Phase 7 added for revenue attribution rather than a
   * parallel tracking mechanism. Wallet is included directly (not a second
   * round trip) so callers can group by `wallet.address` for "top customers"
   * without an N+1 query.
   */
  findForProvider(providerAccountId: string, since: Date, listingId?: string): Promise<ProviderApiRequestRow[]> {
    return this.prisma.apiRequest.findMany({
      where: {
        listingId: listingId ?? { not: null },
        listing: { providerAccountId },
        createdAt: { gte: since },
      },
      include: { wallet: true },
      orderBy: { createdAt: 'asc' },
    }) as Promise<ProviderApiRequestRow[]>;
  }
}
