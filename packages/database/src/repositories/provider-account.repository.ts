import type { PrismaClient, ProviderAccount } from '@prisma/client';

export interface CreateProviderAccountInput {
  name: string;
  email: string;
  walletAddress: string;
  apiKeyHash: string;
}

export class ProviderAccountRepository {
  constructor(private readonly prisma: PrismaClient) {}

  create(input: CreateProviderAccountInput): Promise<ProviderAccount> {
    return this.prisma.providerAccount.create({ data: input });
  }

  findById(id: string): Promise<ProviderAccount | null> {
    return this.prisma.providerAccount.findUnique({ where: { id } });
  }

  findByApiKeyHash(apiKeyHash: string): Promise<ProviderAccount | null> {
    return this.prisma.providerAccount.findUnique({ where: { apiKeyHash } });
  }

  findByEmail(email: string): Promise<ProviderAccount | null> {
    return this.prisma.providerAccount.findUnique({ where: { email } });
  }

  /** Used by the verify step's anti-sybil check — one verified identity per wallet address. */
  findVerifiedByWalletAddress(walletAddress: string): Promise<ProviderAccount | null> {
    return this.prisma.providerAccount.findFirst({ where: { walletAddress, status: 'verified' } });
  }

  markVerified(id: string): Promise<ProviderAccount> {
    return this.prisma.providerAccount.update({
      where: { id },
      data: { status: 'verified', verifiedAt: new Date() },
    });
  }

  rotateApiKey(id: string, apiKeyHash: string): Promise<ProviderAccount> {
    return this.prisma.providerAccount.update({ where: { id }, data: { apiKeyHash } });
  }

  /** The manual, admin-only "security audit passed" flag — see routes/admin/provider-verification.route.ts. */
  setSecurityAuditPassed(id: string): Promise<ProviderAccount> {
    return this.prisma.providerAccount.update({ where: { id }, data: { securityAuditPassedAt: new Date() } });
  }
}
