import { createHash } from 'node:crypto';
import type {
  PaymentPayload,
  PaymentRequirement,
  PaymentSettleResult,
  PaymentVerifyResult,
} from '@rohankumar4179/shared-types';
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
  /**
   * Attribution tag stamped into every requirement's `extra.tag`. The
   * GoPlausible facilitator files each settlement under this tag; the
   * Global x402 Challenge leaderboard reads `x402-global-challenge`.
   * Payments settled without it are attributed to dev/direct/bazaar and
   * don't count toward the challenge. Unset = no tag (normal operation).
   */
  challengeTag?: string;
  /**
   * When true, every requirement carries a V1 Bazaar discovery descriptor
   * (`outputSchema`) and the 402 body gains an `extensions.bazaar` block, so
   * the facilitator catalogs the resource in the Bazaar after its first real
   * settlement. Off by default — a resource stays unlisted (but still
   * payable) until this is enabled.
   */
  bazaarDiscovery?: boolean;
  /**
   * Optional `x402-merchant` identity for the Bazaar listing card. Omitted
   * entirely unless `name` is set — the facilitator then falls back to the
   * endpoint domain's OpenGraph / llms.txt / agent-card.json metadata.
   */
  merchant?: {
    name: string;
    website?: string;
    logo?: string;
    categories?: string[];
  };
}

/**
 * Every facilitator HTTP call gets this timeout. Without one, a slow or
 * hung facilitator holds the request (and the Fastify connection serving
 * it) open indefinitely — under any real load that's a resource-exhaustion
 * path, not just a slow response. 20s comfortably covers a real
 * verify/settle round trip without letting one bad facilitator response
 * pin a connection forever.
 */
const FACILITATOR_TIMEOUT_MS = 20_000;

/** USDC on Algorand uses 6 decimal places. */
const USDC_DECIMALS = 1_000_000;

/** ALGO's own base unit (microAlgos) also uses 6 decimal places. */
const ALGO_DECIMALS = 1_000_000;

/**
 * Sentinel `asset` value for a native-ALGO PaymentRequirement. Algorand's
 * native currency isn't an ASA — it has no numeric asset id — so this is
 * never passed to the facilitator as a real asset id; the client instead
 * recognizes this exact string and builds a plain `Payment` transaction
 * (no `AssetTransfer`) — see apps/web/src/lib/x402-client.ts.
 */
export const NATIVE_ALGO_ASSET = 'ALGO';

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

  /**
   * Merge the optional challenge `tag` into a requirement's `extra` bag,
   * preserving whatever the caller already put there (e.g. `feePayer`).
   * Returns undefined when there's nothing to add, so requirements stay
   * byte-for-byte unchanged in normal (untagged, no-feePayer) operation.
   */
  private withTag(extra?: Record<string, unknown>): Record<string, unknown> | undefined {
    if (!this.config.challengeTag) return extra;
    return { ...(extra ?? {}), tag: this.config.challengeTag };
  }

  /**
   * The `input` object shared by both discovery representations — the V1
   * `outputSchema` descriptor and the v2 `extensions.bazaar` block — so the
   * two can never describe the endpoint differently. `isBodyMethod` is
   * returned too since the JSON Schema half of the v2 block keys off it.
   */
  private discoveryInput(context: PaymentContext): { input: Record<string, unknown>; isBodyMethod: boolean } {
    const method = (context.method ?? 'GET').toUpperCase();
    const isBodyMethod = method === 'POST' || method === 'PUT' || method === 'PATCH';
    const input: Record<string, unknown> = { type: 'http', method };
    if (isBodyMethod) {
      input.bodyType = context.discovery?.bodyType ?? 'json';
      input.body = context.discovery?.bodyExample ?? {};
    } else if (context.discovery?.queryParams) {
      input.queryParams = context.discovery.queryParams;
    }
    return { input, isBodyMethod };
  }

  /**
   * V1 Bazaar discovery descriptor for `PaymentRequirement.outputSchema` —
   * the client-independent path: the facilitator reads it straight off the
   * requirements it receives at /verify and /settle. `hasV1OutputSchema`
   * only needs `input.type === "http"` and an `input.method`; everything
   * else is illustrative catalog metadata.
   */
  private discoveryDescriptor(context: PaymentContext): Record<string, unknown> | undefined {
    if (!this.config.bazaarDiscovery || !context.method) return undefined;
    const { input } = this.discoveryInput(context);
    const descriptor: Record<string, unknown> = { input: { ...input, discoverable: true } };
    if (context.discovery?.outputExample !== undefined) descriptor.output = context.discovery.outputExample;
    return descriptor;
  }

  /**
   * x402 v2 `extensions.bazaar` block for the 402 body, shaped exactly like
   * `@x402-avm/extensions`' `declareDiscoveryExtension()` output (info +
   * a JSON Schema the facilitator validates `info` against). Spec-compliant
   * clients copy this into the PaymentPayload; it's the richer complement to
   * the V1 `outputSchema` path above.
   */
  private bazaarExtension(context: PaymentContext): Record<string, unknown> {
    const { input, isBodyMethod } = this.discoveryInput(context);
    const hasOutput = context.discovery?.outputExample !== undefined;

    const inputSchemaProps: Record<string, unknown> = {
      type: { type: 'string', const: 'http' },
      method: { type: 'string' },
    };
    if (isBodyMethod) {
      inputSchemaProps.bodyType = { type: 'string', enum: ['json', 'form-data', 'text'] };
      inputSchemaProps.body = { type: 'object' };
    } else if (context.discovery?.queryParams) {
      inputSchemaProps.queryParams = { type: 'object' };
    }

    return {
      info: {
        input,
        ...(hasOutput ? { output: { type: 'json', example: context.discovery!.outputExample } } : {}),
      },
      schema: {
        $schema: 'https://json-schema.org/draft/2020-12/schema',
        type: 'object',
        properties: {
          input: {
            type: 'object',
            properties: inputSchemaProps,
            required: ['type', 'method'],
            additionalProperties: false,
          },
          ...(hasOutput
            ? {
                output: {
                  type: 'object',
                  properties: { type: { type: 'string' }, example: { type: 'object' } },
                  required: ['type'],
                },
              }
            : {}),
        },
        required: ['input'],
      },
    };
  }

  getResponseExtensions(context: PaymentContext): Record<string, unknown> | undefined {
    if (!this.config.bazaarDiscovery) return undefined;
    const extensions: Record<string, unknown> = { bazaar: this.bazaarExtension(context) };
    const merchant = this.config.merchant;
    if (merchant?.name) {
      extensions['x402-merchant'] = {
        info: {
          name: merchant.name,
          ...(merchant.website ? { website: merchant.website } : {}),
          ...(merchant.logo ? { logo: merchant.logo } : {}),
          ...(merchant.categories?.length ? { categories: merchant.categories } : {}),
        },
        schema: {
          $schema: 'https://json-schema.org/draft/2020-12/schema',
          type: 'object',
          required: ['name'],
          properties: {
            name: { type: 'string' },
            website: { type: 'string' },
            logo: { type: 'string' },
            categories: { type: 'array', items: { type: 'string' } },
          },
        },
      };
    }
    return extensions;
  }

  getRequirements(context: PaymentContext): PaymentRequirement[] {
    const outputSchema = this.discoveryDescriptor(context);
    const usdcAmount = Math.round(context.priceUsd * USDC_DECIMALS).toString();
    const requirements: PaymentRequirement[] = [
      {
        scheme: 'exact',
        network: this.network(),
        maxAmountRequired: usdcAmount,
        amount: usdcAmount,
        resource: context.resource,
        description: `Access to ${context.resource}`,
        mimeType: 'application/json',
        payTo: this.config.payToAddress,
        asset: this.config.usdcAssetId,
        maxTimeoutSeconds: 60,
        extra: this.withTag(this.config.feePayerAddress ? { feePayer: this.config.feePayerAddress } : undefined),
        ...(outputSchema ? { outputSchema } : {}),
      },
    ];

    // A second, native-ALGO requirement — only offered when a live ALGO/USD
    // price was resolved (see apps/api's x402 middleware), since otherwise
    // there is no correct amount to quote. Unlike the USDC leg above, this
    // is a single native Payment transaction (no ASA, no atomic fee-payer
    // group): the payer already needs ALGO to make the payment at all, so
    // it can trivially cover its own ~0.001 ALGO network fee too.
    if (context.algoUsdPrice && context.algoUsdPrice > 0) {
      const algoAmount = Math.round((context.priceUsd / context.algoUsdPrice) * ALGO_DECIMALS).toString();
      const algoExtra = this.withTag(undefined);
      requirements.push({
        scheme: 'exact',
        network: this.network(),
        maxAmountRequired: algoAmount,
        amount: algoAmount,
        resource: context.resource,
        description: `Access to ${context.resource} (paid in native ALGO)`,
        mimeType: 'application/json',
        payTo: this.config.payToAddress,
        asset: NATIVE_ALGO_ASSET,
        maxTimeoutSeconds: 60,
        ...(algoExtra ? { extra: algoExtra } : {}),
        ...(outputSchema ? { outputSchema } : {}),
      });
    }

    return requirements;
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
      signal: AbortSignal.timeout(FACILITATOR_TIMEOUT_MS),
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
      signal: AbortSignal.timeout(FACILITATOR_TIMEOUT_MS),
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
