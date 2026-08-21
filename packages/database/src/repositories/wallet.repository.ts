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

  /**
   * Atomically reserves `amountAtomic` against this wallet's daily spend cap
   * and reports whether the reservation succeeded — a single conditional
   * UPDATE, not a read-then-write, so two concurrent requests for the same
   * wallet can never both observe "under the cap" and both proceed. If
   * `dailySpendDate` is before `startOfTodayUtc` the counter rolls over to 0
   * first, in the same statement.
   *
   * Call this *before* creating the Payment row / settling, and call
   * `releaseDailySpend` with the same amount if settlement then fails, so a
   * failed payment doesn't permanently eat into the cap.
   */
  async reserveDailySpend(
    walletId: string,
    amountAtomic: bigint,
    capAtomic: bigint,
    startOfTodayUtc: Date,
    now: Date,
  ): Promise<boolean> {
    const affected = await this.prisma.$executeRaw`
      UPDATE "Wallet"
      SET "dailySpendAtomic" = CASE WHEN "dailySpendDate" < ${startOfTodayUtc} THEN ${amountAtomic} ELSE "dailySpendAtomic" + ${amountAtomic} END,
          "dailySpendDate" = CASE WHEN "dailySpendDate" < ${startOfTodayUtc} THEN ${now} ELSE "dailySpendDate" END
      WHERE "id" = ${walletId}
        AND (
          "dailySpendDate" < ${startOfTodayUtc}
            AND ${amountAtomic} <= ${capAtomic}
          OR "dailySpendDate" >= ${startOfTodayUtc}
            AND "dailySpendAtomic" + ${amountAtomic} <= ${capAtomic}
        )
    `;
    return affected > 0;
  }

  /** Reverses a reservation made by `reserveDailySpend` when settlement subsequently fails. */
  async releaseDailySpend(walletId: string, amountAtomic: bigint): Promise<void> {
    await this.prisma.$executeRaw`
      UPDATE "Wallet"
      SET "dailySpendAtomic" = CASE WHEN "dailySpendAtomic" - ${amountAtomic} > 0 THEN "dailySpendAtomic" - ${amountAtomic} ELSE 0 END
      WHERE "id" = ${walletId}
    `;
  }
}
