import 'fastify';
import type { ErrorCode, PaymentPayload, PaymentRequirement } from '@agentmarket/shared-types';

declare module 'fastify' {
  interface FastifyRequest {
    requestId: string;
    startTimeMs: number;
    validated?: {
      query?: unknown;
      body?: unknown;
    };
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
