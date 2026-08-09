import type { ApiListing, Payment, PrismaClient } from '@prisma/client';

export interface CreatePaymentInput {
  paymentRef: string;
  resource: string;
  amountAtomic: string;
  asset: string;
  network: string;
  scheme: string;
  walletId?: string;
  userId?: string;
  /** Set only when this payment settles a call against a published third-party listing. */
  listingId?: string;
}

export type SettledProviderPayment = Payment & { listing: ApiListing };

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

  /**
   * Every settled payment attributed to one of a provider's own listings —
   * the source rows for the revenue dashboard's totals and per-listing
   * breakdown. Joins the listing in directly so callers have `payoutSplitBps`
   * without a second round trip.
   */
  findSettledForProvider(providerAccountId: string): Promise<SettledProviderPayment[]> {
    return this.prisma.payment.findMany({
      where: { status: 'SETTLED', listingId: { not: null }, listing: { providerAccountId } },
      include: { listing: true },
      orderBy: { settledAt: 'desc' },
    }) as Promise<SettledProviderPayment[]>;
  }

  /**
   * Every *resolved* payment attempt (settled or failed — never pending)
   * against a provider's own listings since a given time, for the
   * analytics dashboard's payment-success-rate signal. Deliberately not
   * "every request" — a free 402 probe with no X-PAYMENT header never
   * creates a Payment row at all, so this is already scoped to real attempts.
   */
  findAttemptsForProvider(providerAccountId: string, since: Date, listingId?: string): Promise<Payment[]> {
    return this.prisma.payment.findMany({
      where: {
        status: { in: ['SETTLED', 'FAILED'] },
        listingId: listingId ?? { not: null },
        listing: { providerAccountId },
        createdAt: { gte: since },
      },
    });
  }
}
