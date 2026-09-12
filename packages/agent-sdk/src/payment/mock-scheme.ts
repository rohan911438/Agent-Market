import { randomUUID } from 'node:crypto';
import type { PaymentPayload, PaymentRequirement } from '@rohankumar4179/shared-types';
import type { DiscoveryEcho, PaymentScheme } from '../types.js';

/**
 * Pays against the server's MockPaymentProvider — always "settles," no
 * network, no funds, no facilitator. This is the scheme
 * `createMockPaymentScheme()` returns, and it's what every AGENT_SDK
 * integration test in this repo runs against; it's also the right choice
 * for local dev against `PAYMENT_PROVIDER=mock`. It will not work against a
 * server running the real `algorand-x402` provider — use
 * `createAlgorandPaymentScheme` for that.
 */
export class MockPaymentScheme implements PaymentScheme {
  constructor(private readonly address = `mock-agent-${randomUUID().slice(0, 8)}`) {}

  supports(network: string): boolean {
    return network === 'mock';
  }

  async createPayload(requirement: PaymentRequirement, x402Version: number, _discoveryEcho?: DiscoveryEcho): Promise<PaymentPayload> {
    return {
      x402Version,
      scheme: requirement.scheme,
      network: requirement.network,
      payload: { nonce: randomUUID(), address: this.address },
    };
  }
}

export function createMockPaymentScheme(address?: string): PaymentScheme {
  return new MockPaymentScheme(address);
}
