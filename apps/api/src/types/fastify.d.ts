import 'fastify';
import type { ProviderAccount } from '@prisma/client';
import type { ErrorCode, PaymentPayload, PaymentRequirement } from '@agentmarket/shared-types';

declare module 'fastify' {
  interface FastifyRequest {
    requestId: string;
    startTimeMs: number;
    validated?: {
      query?: unknown;
      body?: unknown;
    };
    /** Set by the provider-auth preHandler once a Bearer API key resolves to an account. */
    providerAccount?: ProviderAccount;
    paymentContext?: {
      paymentRef: string;
      payerAddress?: string;
      payload: PaymentPayload;
      requirement: PaymentRequirement;
      transactionId?: string;
      walletId?: string;
    };
    resultMeta?: {
      cacheHit: boolean;
      providers: string[];
    };
    errorCode?: ErrorCode;
  }
}
