import { AlgorandX402Provider, type AlgorandX402ProviderConfig } from './algorand-x402-provider.js';
import { MockPaymentProvider } from './mock-payment-provider.js';
import type { PaymentProvider } from './payment-provider.interface.js';
import { PaymentProviderRegistry } from './provider-registry.js';

export interface CreatePaymentProviderRegistryOptions {
  activeProviderId: 'mock' | 'algorand-x402';
  algorand?: AlgorandX402ProviderConfig;
}

export interface PaymentProviderSetup {
  registry: PaymentProviderRegistry;
  activeProvider: PaymentProvider;
}

/**
 * Registers every available provider and resolves the active one purely
 * from config (PAYMENT_PROVIDER) — switching payment rails never requires
 * a code change here or in any route handler.
 */
export function createPaymentProviderRegistry(options: CreatePaymentProviderRegistryOptions): PaymentProviderSetup {
  const registry = new PaymentProviderRegistry();
  registry.register(new MockPaymentProvider());

  if (options.algorand) {
    registry.register(new AlgorandX402Provider(options.algorand));
  }

  return { registry, activeProvider: registry.get(options.activeProviderId) };
}
