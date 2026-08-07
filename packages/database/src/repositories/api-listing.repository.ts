import type { ApiListing, Prisma, PrismaClient } from '@prisma/client';

export type PublishedApiListing = Prisma.ApiListingGetPayload<{ include: { providerAccount: true } }>;

export interface CreateApiListingInput {
  providerAccountId: string;
  slug: string;
  name: string;
  description: string;
  category: string;
  tags: string;
  upstreamUrl: string;
  openApiSpec?: string;
  docsUrl?: string;
}

export interface ConfigurePricingInput {
  pricingModel: string;
  priceUsd: number;
}

export interface ConfigurePaymentInput {
  payoutWalletAddress: string;
  payoutSplitBps?: number;
}

export class ApiListingRepository {
  constructor(private readonly prisma: PrismaClient) {}

  create(input: CreateApiListingInput): Promise<ApiListing> {
    return this.prisma.apiListing.create({ data: input });
  }

  findById(id: string): Promise<ApiListing | null> {
    return this.prisma.apiListing.findUnique({ where: { id } });
  }

  findBySlug(slug: string): Promise<ApiListing | null> {
    return this.prisma.apiListing.findUnique({ where: { slug } });
  }

  listByProvider(providerAccountId: string): Promise<ApiListing[]> {
    return this.prisma.apiListing.findMany({
      where: { providerAccountId },
      orderBy: { createdAt: 'desc' },
    });
  }

  listPublished(): Promise<PublishedApiListing[]> {
    return this.prisma.apiListing.findMany({
      where: { status: 'published' },
      include: { providerAccount: true },
      orderBy: { publishedAt: 'desc' },
    });
  }

  configurePricing(id: string, input: ConfigurePricingInput): Promise<ApiListing> {
    return this.prisma.apiListing.update({ where: { id }, data: input });
  }

  configurePayment(id: string, input: ConfigurePaymentInput): Promise<ApiListing> {
    return this.prisma.apiListing.update({ where: { id }, data: input });
  }

  publish(id: string): Promise<ApiListing> {
    return this.prisma.apiListing.update({
      where: { id },
      data: { status: 'published', publishedAt: new Date() },
    });
  }
}
