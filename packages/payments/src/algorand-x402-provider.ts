import { createHash } from 'node:crypto';
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
  /**
   * The facilitator's fee-payer account for this network (its `extra.feePayer`
   * from `GET {facilitatorUrl}/supported`) — the x402 AVM "exact" v2 scheme
   * builds a 2-txn atomic group (client's ASA transfer + a zero-amount
   * fee-sponsor txn from this account) so the payer never needs ALGO for
   * network fees. Required for the real (non-mock) Algorand facilitator.
   */
  feePayerAddress?: string;
}

/** USDC on Algorand uses 6 decimal places. */
const USDC_DECIMALS = 1_000_000;

/**
 * CAIP-2 chain identifiers for Algorand (genesis-hash-based, per
 * https://chainagnostic.org/CAIPs/caip-2). The legacy name-based identifiers
 * ("algorand-testnet"/"algorand-mainnet") are still accepted by some x402
 * facilitators but not others (the live GoPlausible facilitator only accepts
 * CAIP-2), so this is the interoperable choice.
 */
const ALGORAND_CAIP2_NETWORK: Record<'testnet' | 'mainnet', string> = {
  testnet: 'algorand:SGO1GKSzyE7IEPItTxCByw9x8FmnrCDexi9/cOUJOiI=',
  mainnet: 'algorand:wGHE2Pwdvd7S12BL5FaOP20EGYesN73ktiC1qzkkit8=',
};

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
  // The live GoPlausible facilitator's AVM "exact" scheme is only actually
  // wired up for x402 v2 (CAIP-2 network + `amount` + atomic fee-payer
  // group) despite v1/legacy entries appearing in its /supported discovery
  // listing — confirmed empirically against the real facilitator, since v1
  // requests get "No facilitator registered for scheme/network" at /verify.
  readonly x402Version = 2;

  constructor(private readonly config: AlgorandX402ProviderConfig) {}

  private network(): string {
    return ALGORAND_CAIP2_NETWORK[this.config.network];
  }

  getRequirements(context: PaymentContext): PaymentRequirement {
    const amount = Math.round(context.priceUsd * USDC_DECIMALS).toString();
    return {
      scheme: 'exact',
      network: this.network(),
      maxAmountRequired: amount,
      amount,
      resource: context.resource,
      description: `Access to ${context.resource}`,
      mimeType: 'application/json',
      payTo: this.config.payToAddress,
      asset: this.config.usdcAssetId,
      maxTimeoutSeconds: 60,
      extra: this.config.feePayerAddress ? { feePayer: this.config.feePayerAddress } : undefined,
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

  // AVM "exact" scheme shape: an atomic group of base64-encoded signed
  // transactions: the specific signed payment txn is a unique, deterministic
  // fingerprint for this payment (same signed txn resubmitted => same ref).
  const paymentGroup = inner.paymentGroup;
  const paymentIndex = inner.paymentIndex;
  if (Array.isArray(paymentGroup) && typeof paymentIndex === 'number') {
    const signedPaymentTxn = paymentGroup[paymentIndex];
    if (typeof signedPaymentTxn === 'string') {
      return createHash('sha256').update(signedPaymentTxn).digest('hex').slice(0, 32);
    }
  }

  const candidate = inner.txId ?? inner.transactionId ?? inner.nonce ?? inner.signature;
  return typeof candidate === 'string' ? candidate : undefined;
}
