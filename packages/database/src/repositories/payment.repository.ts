import type { Payment, PrismaClient } from '@prisma/client';

export interface CreatePaymentInput {
  paymentRef: string;
  resource: string;
  amountAtomic: string;
  asset: string;
  network: string;
  scheme: string;
  walletId?: string;
  userId?: string;
}

export class PaymentRepository {
  constructor(private readonly prisma: PrismaClient) {}

  findByPaymentRef(paymentRef: string): Promise<Payment | null> {
    return this.prisma.payment.findUnique({ where: { paymentRef } });
  }

  create(input: CreatePaymentInput): Promise<Payment> {
    return this.prisma.payment.create({
      data: { ...input, status: 'PENDING' },
    });
  }

  markSettled(paymentRef: string, transactionId: string, cachedResponseId?: string): Promise<Payment> {
    return this.prisma.payment.update({
      where: { paymentRef },
      data: {
        status: 'SETTLED',
        transactionId,
        settledAt: new Date(),
        ...(cachedResponseId ? { cachedResponseId } : {}),
      },
    });
  }

  markFailed(paymentRef: string): Promise<Payment> {
    return this.prisma.payment.update({
      where: { paymentRef },
      data: { status: 'FAILED' },
    });
  }

  /** Sum of settled spend for a wallet since a given timestamp — backs daily spend caps. */
  async sumSettledSpendSince(walletId: string, since: Date): Promise<number> {
    const rows = await this.prisma.payment.findMany({
      where: { walletId, status: 'SETTLED', settledAt: { gte: since } },
      select: { amountAtomic: true },
    });
    return rows.reduce((sum, row) => sum + Number(row.amountAtomic), 0);
  }
}
