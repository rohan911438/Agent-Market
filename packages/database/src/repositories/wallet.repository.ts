import type { PrismaClient, Wallet } from '@prisma/client';

export class WalletRepository {
  constructor(private readonly prisma: PrismaClient) {}

  findByAddress(address: string): Promise<Wallet | null> {
    return this.prisma.wallet.findUnique({ where: { address } });
  }

  /** Creates the wallet on first sight, otherwise bumps lastSeenAt. */
  touch(address: string, network: string): Promise<Wallet> {
    return this.prisma.wallet.upsert({
      where: { address },
      update: { lastSeenAt: new Date() },
      create: { address, network },
    });
  }

  markVerified(address: string): Promise<Wallet> {
    return this.prisma.wallet.update({
      where: { address },
      data: { isVerified: true },
    });
  }
}
