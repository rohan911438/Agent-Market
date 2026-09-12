import type { PaymentPayload, PaymentRequirement } from '@rohankumar4179/shared-types';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AlgorandX402Provider, type AlgorandX402ProviderConfig } from './algorand-x402-provider.js';
import type { PaymentContext } from './payment-provider.interface.js';

const baseConfig: AlgorandX402ProviderConfig = {
  facilitatorUrl: 'https://facilitator.goplausible.xyz',
  network: 'mainnet',
  payToAddress: 'PAYTOADDR',
  usdcAssetId: '31566704',
  feePayerAddress: 'FEEPAYER',
};

const ctx = (over: Partial<PaymentContext> = {}): PaymentContext => ({
  resource: '/v1/analyze',
  priceUsd: 0.05,
  ...over,
});

describe('AlgorandX402Provider — challenge tag + Bazaar discovery', () => {
  it('leaves requirements untouched when neither challengeTag nor bazaarDiscovery is set', () => {
    const provider = new AlgorandX402Provider(baseConfig);
    const usdc = provider.getRequirements(ctx({ method: 'POST' }))[0]!;

    expect(usdc.extra).toEqual({ feePayer: 'FEEPAYER' });
    expect(usdc.outputSchema).toBeUndefined();
    expect(provider.getResponseExtensions(ctx({ method: 'POST' }))).toBeUndefined();
  });

  it('stamps extra.tag on every requirement (USDC + native ALGO), preserving feePayer', () => {
    const provider = new AlgorandX402Provider({ ...baseConfig, challengeTag: 'x402-global-challenge' });
    const reqs = provider.getRequirements(ctx({ algoUsdPrice: 0.2 }));

    expect(reqs).toHaveLength(2);
    expect(reqs[0]!.extra).toEqual({ feePayer: 'FEEPAYER', tag: 'x402-global-challenge' });
    // native-ALGO leg has no feePayer group but still carries the tag
    expect(reqs[1]!.asset).toBe('ALGO');
    expect(reqs[1]!.extra).toEqual({ tag: 'x402-global-challenge' });
  });

  it('adds a V1 discovery descriptor to outputSchema for a GET route', () => {
    const provider = new AlgorandX402Provider({ ...baseConfig, bazaarDiscovery: true });
    const usdc = provider.getRequirements(
      ctx({ method: 'GET', discovery: { queryParams: { symbol: 'BTC' }, outputExample: { score: 1 } } }),
    )[0]!;

    expect(usdc.outputSchema).toEqual({
      input: { type: 'http', method: 'GET', discoverable: true, queryParams: { symbol: 'BTC' } },
      output: { score: 1 },
    });
  });

  it('uses bodyType/body in the descriptor for a POST route', () => {
    const provider = new AlgorandX402Provider({ ...baseConfig, bazaarDiscovery: true });
    const usdc = provider.getRequirements(
      ctx({ method: 'POST', discovery: { bodyExample: { text: 'hi' } } }),
    )[0]!;

    expect(usdc.outputSchema).toMatchObject({
      input: { type: 'http', method: 'POST', bodyType: 'json', body: { text: 'hi' } },
    });
  });

  it('omits the descriptor when bazaarDiscovery is on but the HTTP method is unknown', () => {
    const provider = new AlgorandX402Provider({ ...baseConfig, bazaarDiscovery: true });
    const usdc = provider.getRequirements(ctx({}))[0]!;
    expect(usdc.outputSchema).toBeUndefined();
  });

  it('produces a v2 extensions.bazaar block whose schema validates its own info', () => {
    const provider = new AlgorandX402Provider({ ...baseConfig, bazaarDiscovery: true });
    const ext = provider.getResponseExtensions(ctx({ method: 'GET', discovery: { outputExample: { ok: true } } }))!;
    const bazaar = ext.bazaar as { info: Record<string, unknown>; schema: Record<string, unknown> };

    expect(bazaar.info).toMatchObject({ input: { type: 'http', method: 'GET' }, output: { type: 'json', example: { ok: true } } });
    expect(bazaar.schema).toMatchObject({ required: ['input'] });
  });

  it('includes an x402-merchant identity block only when a merchant name is configured', () => {
    const withName = new AlgorandX402Provider({
      ...baseConfig,
      bazaarDiscovery: true,
      merchant: { name: 'Agent Market', website: 'https://x.example', categories: ['api', 'algorand'] },
    });
    const ext = withName.getResponseExtensions(ctx({ method: 'GET' }))!;
    expect((ext['x402-merchant'] as { info: Record<string, unknown> }).info).toEqual({
      name: 'Agent Market',
      website: 'https://x.example',
      categories: ['api', 'algorand'],
    });

    const noName = new AlgorandX402Provider({ ...baseConfig, bazaarDiscovery: true });
    expect(noName.getResponseExtensions(ctx({ method: 'GET' }))!['x402-merchant']).toBeUndefined();
  });
});

describe('AlgorandX402Provider — verify/settle forward the client-echoed extensions bag', () => {
  // Regression for a real bug: a real settled MainNet payment (2026-09-11)
  // was recorded by the GoPlausible facilitator's leaderboard with
  // bazaar:false, challenge:false. Root cause traced to every AVM client in
  // this repo (packages/agent-sdk's AlgorandPaymentScheme, apps/web's
  // x402-client.ts, scripts/testnet/demo-payment.mjs) never echoing the 402
  // response's `extensions` bag back in the PaymentPayload, compounded by
  // PaymentPayloadSchema having no `extensions` field to survive
  // decodePaymentHeader's zod .parse() even if a client did. Fixed on both
  // sides; this test pins the facilitator-facing half — verify()/settle()
  // must forward whatever `extensions` the decoded payload carries,
  // unmodified, since that's what the facilitator's Bazaar/challenge-tag
  // indexer actually reads (confirmed against the live facilitator's own
  // discovery/leaderboard endpoints — see docs/PAYMENT_FLOW.md).
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const requirement: PaymentRequirement = {
    scheme: 'exact',
    network: 'algorand:wGHE2Pwdvd7S12BL5FaOP20EGYesN73ktiC1qzkkit8=',
    maxAmountRequired: '50000',
    resource: '/v1/analyze',
    description: 'Access to /v1/analyze',
    mimeType: 'application/json',
    payTo: 'PAYTOADDR',
    asset: '31566704',
    maxTimeoutSeconds: 60,
  };

  const payload: PaymentPayload = {
    x402Version: 2,
    scheme: 'exact',
    network: requirement.network,
    payload: { paymentGroup: ['AAAA'], paymentIndex: 0 },
    extensions: { bazaar: { info: { input: { type: 'http', method: 'GET' } } } },
  };

  it('includes payload.extensions in the /verify request body', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ isValid: true, payerAddress: 'PAYER' }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    const provider = new AlgorandX402Provider({ ...baseConfig });
    await provider.verify(payload, requirement);

    const [, init] = fetchMock.mock.calls[0]!;
    const sentBody = JSON.parse((init as RequestInit).body as string);
    expect(sentBody.paymentPayload.extensions).toEqual(payload.extensions);
  });

  it('includes payload.extensions in the /settle request body', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ success: true, transactionId: 'TXID' }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    const provider = new AlgorandX402Provider({ ...baseConfig });
    await provider.settle(payload, requirement);

    const [, init] = fetchMock.mock.calls[0]!;
    const sentBody = JSON.parse((init as RequestInit).body as string);
    expect(sentBody.paymentPayload.extensions).toEqual(payload.extensions);
  });
});
