import type { PaymentPayload, PaymentRequiredResponse } from '@rohankumar4179/shared-types';

export interface FakeResource {
  priceUsd: number;
  network?: string;
  scheme?: string;
  payTo?: string;
  asset?: string;
  response: unknown | ((payload: PaymentPayload) => unknown);
  /** Return a transient 500 for this many attempts before succeeding — exercises retry. */
  failFirstNAttempts?: number;
  /** Always reject the payment itself (simulates a bad signature / failed settlement). */
  rejectPayment?: boolean;
}

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

/**
 * A `typeof fetch`-compatible fake implementing just enough of the real
 * server's x402 contract (402 with `accepts`, then 200 once a well-formed
 * X-PAYMENT header shows up) to unit test AgentMarketClient's orchestration
 * — payment construction, budget checks, retries, fallbacks, caching — all
 * of which are the SDK's own logic, independent of whichever PaymentScheme
 * actually signs the payload. `AlgorandPaymentScheme` itself is not
 * exercised here; its correctness rests on `@x402-avm/avm`'s own contract.
 */
export function createFakeServer(resources: Record<string, FakeResource>) {
  const attemptCounts = new Map<string, number>();

  const fetchImpl = (async (input: Parameters<typeof fetch>[0], init?: RequestInit) => {
    const url = new URL(typeof input === 'string' ? input : input.toString());
    const path = url.pathname;
    const resource = resources[path];

    if (!resource) {
      return jsonResponse(404, { error: { code: 'NOT_FOUND', message: `no fake resource for ${path}`, requestId: 'test' } });
    }

    const headers = new Headers(init?.headers);
    const paymentHeader = headers.get('x-payment');

    if (!paymentHeader) {
      const body: PaymentRequiredResponse = {
        x402Version: 1,
        accepts: [
          {
            scheme: resource.scheme ?? 'exact',
            network: resource.network ?? 'mock',
            maxAmountRequired: String(Math.round(resource.priceUsd * 1_000_000)),
            amount: String(Math.round(resource.priceUsd * 1_000_000)),
            resource: path,
            description: `Access to ${path}`,
            mimeType: 'application/json',
            payTo: resource.payTo ?? 'TEST_PAY_TO',
            asset: resource.asset ?? 'TEST_ASSET',
            maxTimeoutSeconds: 60,
          },
        ],
      };
      return jsonResponse(402, body);
    }

    const count = (attemptCounts.get(path) ?? 0) + 1;
    attemptCounts.set(path, count);

    if (resource.failFirstNAttempts && count <= resource.failFirstNAttempts) {
      return jsonResponse(500, { error: { code: 'INTERNAL_ERROR', message: 'simulated transient failure', requestId: 'test' } });
    }

    if (resource.rejectPayment) {
      return jsonResponse(402, {
        error: { code: 'PAYMENT_VERIFICATION_FAILED', message: 'simulated payment rejection', requestId: 'test' },
      });
    }

    const payload = JSON.parse(Buffer.from(paymentHeader, 'base64').toString('utf-8')) as PaymentPayload;
    const responseBody = typeof resource.response === 'function' ? resource.response(payload) : resource.response;
    return jsonResponse(200, responseBody);
  }) as typeof fetch;

  return {
    fetchImpl,
    attemptsFor: (path: string): number => attemptCounts.get(path) ?? 0,
  };
}
