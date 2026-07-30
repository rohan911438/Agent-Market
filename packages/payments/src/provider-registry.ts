import type { PaymentProvider } from './payment-provider.interface.js';

export class PaymentProviderRegistry {
  private readonly providers = new Map<string, PaymentProvider>();

  register(provider: PaymentProvider): void {
    this.providers.set(provider.id, provider);
  }

  get(id: string): PaymentProvider {
    const provider = this.providers.get(id);
    if (!provider) {
      throw new Error(
        `No payment provider registered for id "${id}". Registered: ${Array.from(this.providers.keys()).join(', ') || '(none)'}`,
      );
    }
    return provider;
  }

  has(id: string): boolean {
    return this.providers.has(id);
  }
}
