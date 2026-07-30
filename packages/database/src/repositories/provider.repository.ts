import type { PrismaClient, Provider } from '@prisma/client';

export class ProviderRepository {
  constructor(private readonly prisma: PrismaClient) {}

  listEnabled(): Promise<Provider[]> {
    return this.prisma.provider.findMany({ where: { isEnabled: true } });
  }

  recordSuccess(name: string): Promise<Provider> {
    return this.prisma.provider.update({
      where: { name },
      data: { lastSuccessAt: new Date(), failureCount: 0 },
    });
  }

  recordFailure(name: string): Promise<Provider> {
    return this.prisma.provider.update({
      where: { name },
      data: { lastFailureAt: new Date(), failureCount: { increment: 1 } },
    });
  }

  upsert(input: {
    name: string;
    capability: string;
    isKeyless: boolean;
  }): Promise<Provider> {
    return this.prisma.provider.upsert({
      where: { name: input.name },
      update: { capability: input.capability, isKeyless: input.isKeyless },
      create: input,
    });
  }
}
