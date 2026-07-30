import type {
  PaymentPayload,
  PaymentRequirement,
  PaymentSettleResult,
  PaymentVerifyResult,
} from '@agentmarket/shared-types';
import type { PaymentContext, PaymentProvider } from './payment-provider.interface.js';

export interface AlgorandX402ProviderConfig {
  facilitatorUrl: string;
  network: 'testnet' | 'mainnet';
  payToAddress: string;
  usdcAssetId: string;
}

/** USDC on Algorand uses 6 decimal places. */
const USDC_DECIMALS = 1_000_000;

interface FacilitatorVerifyResponse {
  isValid?: boolean;
  valid?: boolean;
  invalidReason?: string;
  payer?: string;
  payerAddress?: string;
}

interface FacilitatorSettleResponse {
  success?: boolean;
  transaction?: string;
  transactionId?: string;
  errorReason?: string;
}

/**
 * Implements PaymentProvider against an x402 facilitator's documented HTTP
 * contract (`POST {facilitatorUrl}/verify`, `POST {facilitatorUrl}/settle`
 * with `{ paymentPayload, paymentRequirements }` bodies) — the actual
 * interoperability surface the x402 spec defines. Any spec-compliant
 * facilitator works here unmodified; no facilitator-specific SDK required.
 */
export class AlgorandX402Provider implements PaymentProvider {
  readonly id = 'algorand-x402';

  constructor(private readonly config: AlgorandX402ProviderConfig) {}

  private network(): string {
    return `algorand-${this.config.network}`;
  }

  getRequirements(context: PaymentContext): PaymentRequirement {
    const maxAmountRequired = Math.round(context.priceUsd * USDC_DECIMALS).toString();
    return {
      scheme: 'exact',
      network: this.network(),
      maxAmountRequired,
      resource: context.resource,
      description: `Access to ${context.resource}`,
      mimeType: 'application/json',
      payTo: this.config.payToAddress,
      asset: this.config.usdcAssetId,
      maxTimeoutSeconds: 60,
    };
  }

  async verify(payload: PaymentPayload, requirement: PaymentRequirement): Promise<PaymentVerifyResult> {
    const res = await fetch(`${this.config.facilitatorUrl}/verify`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        x402Version: payload.x402Version,
        paymentPayload: payload,
        paymentRequirements: requirement,
      }),
    });

    if (!res.ok) {
      return { isValid: false, invalidReason: `facilitator returned HTTP ${res.status}` };
    }

    const data = (await res.json()) as FacilitatorVerifyResponse;
    const isValid = data.isValid ?? data.valid ?? false;

    return {
      isValid,
      invalidReason: isValid ? undefined : (data.invalidReason ?? 'facilitator rejected payment'),
      payerAddress: data.payerAddress ?? data.payer,
      paymentRef: extractPaymentRef(payload),
    };
  }

  async settle(payload: PaymentPayload, requirement: PaymentRequirement): Promise<PaymentSettleResult> {
    const res = await fetch(`${this.config.facilitatorUrl}/settle`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        x402Version: payload.x402Version,
        paymentPayload: payload,
        paymentRequirements: requirement,
      }),
    });

    if (!res.ok) {
      return { success: false, network: this.network(), errorReason: `facilitator returned HTTP ${res.status}` };
    }

    const data = (await res.json()) as FacilitatorSettleResponse;
    const success = data.success ?? false;

    return {
      success,
      transactionId: data.transactionId ?? data.transaction,
      network: this.network(),
      errorReason: success ? undefined : (data.errorReason ?? 'facilitator failed to settle payment'),
    };
  }
}

function extractPaymentRef(payload: PaymentPayload): string | undefined {
  const inner = payload.payload;
  const candidate = inner.txId ?? inner.transactionId ?? inner.nonce ?? inner.signature;
  return typeof candidate === 'string' ? candidate : undefined;
}
