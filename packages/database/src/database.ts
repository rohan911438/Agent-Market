import type { PrismaClient } from '@prisma/client';
import { getPrismaClient } from './client.js';
import { ApiListingRepository } from './repositories/api-listing.repository.js';
import { ApiRequestRepository } from './repositories/api-request.repository.js';
import { AuditLogRepository } from './repositories/audit-log.repository.js';
import { CachedResponseRepository } from './repositories/cached-response.repository.js';
import { MarketplaceApiRepository } from './repositories/marketplace-api.repository.js';
import { PaymentRepository } from './repositories/payment.repository.js';
import { PayoutRepository } from './repositories/payout.repository.js';
import { ProviderAccountRepository } from './repositories/provider-account.repository.js';
import { ProviderRepository } from './repositories/provider.repository.js';
import { RateLimitRepository } from './repositories/rate-limit.repository.js';
import { UsageRepository } from './repositories/usage.repository.js';
import { UserRepository } from './repositories/user.repository.js';
import { WalletRepository } from './repositories/wallet.repository.js';

/**
 * Single composition root for data access. Route handlers and services take
 * a `Database` instance (constructor injection) instead of importing Prisma
 * directly, keeping persistence details out of business logic.
 */
export class Database {
  readonly users: UserRepository;
  readonly wallets: WalletRepository;
  readonly payments: PaymentRepository;
  readonly apiRequests: ApiRequestRepository;
  readonly cachedResponses: CachedResponseRepository;
  readonly rateLimits: RateLimitRepository;
  readonly usage: UsageRepository;
  readonly auditLogs: AuditLogRepository;
  readonly providers: ProviderRepository;
  readonly marketplaceApis: MarketplaceApiRepository;
  readonly providerAccounts: ProviderAccountRepository;
  readonly apiListings: ApiListingRepository;
  readonly payouts: PayoutRepository;

  constructor(readonly prisma: PrismaClient = getPrismaClient()) {
    this.users = new UserRepository(prisma);
    this.wallets = new WalletRepository(prisma);
    this.payments = new PaymentRepository(prisma);
    this.apiRequests = new ApiRequestRepository(prisma);
    this.cachedResponses = new CachedResponseRepository(prisma);
    this.rateLimits = new RateLimitRepository(prisma);
    this.usage = new UsageRepository(prisma);
    this.auditLogs = new AuditLogRepository(prisma);
    this.providers = new ProviderRepository(prisma);
    this.marketplaceApis = new MarketplaceApiRepository(prisma);
    this.providerAccounts = new ProviderAccountRepository(prisma);
    this.apiListings = new ApiListingRepository(prisma);
    this.payouts = new PayoutRepository(prisma);
  }

  disconnect(): Promise<void> {
    return this.prisma.$disconnect();
  }
}
