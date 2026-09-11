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

  /**
   * Real call counts per third-party listing since a given time — the
   * marketplace storefront's "Trending" signal (Phase 10). Grouped in one
   * query rather than one count per listing.
   */
  async countsByListingIds(listingIds: string[], since: Date): Promise<Map<string, number>> {
    if (listingIds.length === 0) return new Map();
    const rows = await this.prisma.apiRequest.groupBy({
      by: ['listingId'],
      where: { listingId: { in: listingIds }, createdAt: { gte: since } },
      _count: { _all: true },
    });
    return new Map(rows.filter((r) => r.listingId !== null).map((r) => [r.listingId as string, r._count._all]));
  }

  /**
   * Same as `countsByListingIds`, but for first-party endpoints, which are
   * identified by `route` (matching `MarketplaceApi.endpoint`) rather than
   * `listingId` — first-party traffic never sets `listingId`, so this is
   * explicitly scoped to `listingId: null` to avoid any chance of double
   * counting against a third-party listing that happened to share a route
   * string.
   */
  async countsByRoutes(routes: string[], since: Date): Promise<Map<string, number>> {
    if (routes.length === 0) return new Map();
    const rows = await this.prisma.apiRequest.groupBy({
      by: ['route'],
      where: { route: { in: routes }, listingId: null, createdAt: { gte: since } },
      _count: { _all: true },
    });
    return new Map(rows.map((r) => [r.route, r._count._all]));
  }

  /**
   * Raw per-listing latency samples since a given time — AI Discovery's
   * (Phase 11) real latency signal. Returns raw values rather than a
   * pre-aggregated average so the caller can compute p95 with the same
   * `percentile()` function analytics.ts already uses, instead of a second
   * definition of "percentile" living here.
   */
  async latencyMsByListingIds(listingIds: string[], since: Date): Promise<Map<string, number[]>> {
    if (listingIds.length === 0) return new Map();
    const rows = await this.prisma.apiRequest.findMany({
      where: { listingId: { in: listingIds }, createdAt: { gte: since } },
      select: { listingId: true, latencyMs: true },
    });
    const byListing = new Map<string, number[]>();
    for (const row of rows) {
      if (!row.listingId) continue;
      const samples = byListing.get(row.listingId);
      if (samples) samples.push(row.latencyMs);
      else byListing.set(row.listingId, [row.latencyMs]);
    }
    return byListing;
  }

  /** Same as `latencyMsByListingIds`, but for first-party endpoints identified by `route` — see `countsByRoutes` for why `listingId: null` is explicit here. */
  async latencyMsByRoutes(routes: string[], since: Date): Promise<Map<string, number[]>> {
    if (routes.length === 0) return new Map();
    const rows = await this.prisma.apiRequest.findMany({
      where: { route: { in: routes }, listingId: null, createdAt: { gte: since } },
      select: { route: true, latencyMs: true },
    });
    const byRoute = new Map<string, number[]>();
    for (const row of rows) {
      const samples = byRoute.get(row.route);
      if (samples) samples.push(row.latencyMs);
      else byRoute.set(row.route, [row.latencyMs]);
    }
    return byRoute;
  }

  /**
   * Total vs. "available" (statusCode < 500 — reachable and responded,
   * regardless of whether the *caller's* input was valid) request counts
   * per third-party listing over a rolling window — the real-traffic half
   * of Phase 13's availability score (services/availability.ts blends this
   * with synthetic-check counts).
   */
  async availabilityCountsByListingIds(listingIds: string[], since: Date): Promise<Map<string, { total: number; successful: number }>> {
    if (listingIds.length === 0) return new Map();
    const [totalRows, successRows] = await Promise.all([
      this.prisma.apiRequest.groupBy({
        by: ['listingId'],
        where: { listingId: { in: listingIds }, createdAt: { gte: since } },
        _count: { _all: true },
      }),
      this.prisma.apiRequest.groupBy({
        by: ['listingId'],
        where: { listingId: { in: listingIds }, createdAt: { gte: since }, statusCode: { lt: 500 } },
        _count: { _all: true },
      }),
    ]);
    const successById = new Map(successRows.filter((r) => r.listingId).map((r) => [r.listingId as string, r._count._all]));
    return new Map(
      totalRows
        .filter((r) => r.listingId)
        .map((r) => [r.listingId as string, { total: r._count._all, successful: successById.get(r.listingId as string) ?? 0 }]),
    );
  }

  /** Same as `availabilityCountsByListingIds`, but for first-party endpoints identified by `route`. */
  async availabilityCountsByRoutes(routes: string[], since: Date): Promise<Map<string, { total: number; successful: number }>> {
    if (routes.length === 0) return new Map();
    const [totalRows, successRows] = await Promise.all([
      this.prisma.apiRequest.groupBy({
        by: ['route'],
        where: { route: { in: routes }, listingId: null, createdAt: { gte: since } },
        _count: { _all: true },
      }),
      this.prisma.apiRequest.groupBy({
        by: ['route'],
        where: { route: { in: routes }, listingId: null, createdAt: { gte: since }, statusCode: { lt: 500 } },
        _count: { _all: true },
      }),
    ]);
    const successByRoute = new Map(successRows.map((r) => [r.route, r._count._all]));
    return new Map(totalRows.map((r) => [r.route, { total: r._count._all, successful: successByRoute.get(r.route) ?? 0 }]));
  }
}
