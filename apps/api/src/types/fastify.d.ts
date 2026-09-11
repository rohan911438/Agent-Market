import 'fastify';
import type { ProviderAccount } from '@prisma/client';
import type { ErrorCode, PaymentPayload, PaymentRequirement, WorkflowStepInput } from '@agentmarket/shared-types';

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
      /** Set only when this call was against a published third-party listing. */
      listingId?: string;
    };
    resultMeta?: {
      cacheHit: boolean;
      providers: string[];
    };
    errorCode?: ErrorCode;
    /**
     * Set by the workflow route's dynamic x402 meta resolver (Phase 12) once
     * the pipeline has been parsed, validated, and priced — so the handler
     * doesn't re-parse the body or re-probe prices a second time.
     */
    workflowSteps?: WorkflowStepInput[];
    workflowStepPricesUsd?: number[];
  }
}
