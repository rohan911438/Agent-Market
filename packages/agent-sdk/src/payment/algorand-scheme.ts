import { ExactAvmScheme, toClientAvmSigner, type ClientAvmSigner } from '@x402-avm/avm';
import algosdk from 'algosdk';
import type { PaymentPayload, PaymentRequirement } from '@rohankumar4179/shared-types';
import type { PaymentScheme } from '../types.js';

export interface AlgorandPaymentSchemeConfig {
  /** A 25-word Algorand mnemonic. Mutually exclusive with `privateKeyBase64` / `signer`. */
  mnemonic?: string;
  /** Base64-encoded 64-byte secret key — `algosdk.mnemonicToSecretKey(...).sk`, base64-encoded. */
  privateKeyBase64?: string;
  /** Bring your own signer (e.g. one backed by a hosted KMS key) instead of holding a raw key in process. */
  signer?: ClientAvmSigner;
}

function resolveSigner(config: AlgorandPaymentSchemeConfig): ClientAvmSigner {
  if (config.signer) return config.signer;
  if (config.privateKeyBase64) return toClientAvmSigner(config.privateKeyBase64);
  if (config.mnemonic) {
    const { sk } = algosdk.mnemonicToSecretKey(config.mnemonic);
    return toClientAvmSigner(Buffer.from(sk).toString('base64'));
  }
  throw new Error('createAlgorandPaymentScheme requires one of: mnemonic, privateKeyBase64, or signer.');
}

/**
 * Pays against the server's real `algorand-x402` provider — signs and
 * settles an actual USDC-on-Algorand transfer through the GoPlausible x402
 * facilitator. Building the atomic transaction group (the client's ASA
 * transfer plus the facilitator's fee-payer leg) is delegated entirely to
 * `@x402-avm/avm`'s `ExactAvmScheme` — the reference implementation for
 * this exact wire format — so this class only adapts field names between
 * AgentMarket's `PaymentRequirement` and the shape that library expects;
 * it does not reimplement any transaction-signing logic itself.
 *
 * Needs network access to an Algod node (AlgoNode's public endpoint by
 * default) to fetch suggested transaction parameters, and a funded
 * TestNet/MainNet account to actually settle — an unfunded account fails
 * loudly at that step rather than silently.
 */
export class AlgorandPaymentScheme implements PaymentScheme {
  private readonly scheme: ExactAvmScheme;

  constructor(config: AlgorandPaymentSchemeConfig) {
    this.scheme = new ExactAvmScheme(resolveSigner(config));
  }

  supports(network: string): boolean {
    return network.startsWith('algorand:');
  }

  async createPayload(requirement: PaymentRequirement, x402Version: number, extensions?: Record<string, unknown>): Promise<PaymentPayload> {
    const amount = requirement.amount ?? requirement.maxAmountRequired;
    // `Network` in @x402-avm/core is a `${string}:${string}` CAIP-2 template
    // type; `supports()` above already confirmed this string matches that
    // shape before we ever get here, so the cast is just telling TS what we
    // verified at runtime, not asserting past a real mismatch.
    const result = await this.scheme.createPaymentPayload(x402Version, {
      scheme: requirement.scheme,
      network: requirement.network as `${string}:${string}`,
      asset: requirement.asset,
      amount,
      payTo: requirement.payTo,
      maxTimeoutSeconds: requirement.maxTimeoutSeconds,
      extra: requirement.extra ?? {},
    });

    return {
      x402Version: result.x402Version,
      scheme: requirement.scheme,
      network: requirement.network,
      payload: result.payload,
      // Echoed verbatim, not merged/reshaped — the facilitator's Bazaar
      // extension validates that an echoing client reproduces the advertised
      // `info` faithfully (see docs/PAYMENT_FLOW.md's "Bazaar discovery"
      // section for how this was confirmed against the live facilitator).
      ...(extensions ? { extensions } : {}),
    };
  }
}

export function createAlgorandPaymentScheme(config: AlgorandPaymentSchemeConfig): PaymentScheme {
  return new AlgorandPaymentScheme(config);
}
