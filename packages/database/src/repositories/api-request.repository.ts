import type { ApiRequest, PrismaClient } from '@prisma/client';

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
}
