import type {
  ApiListingView,
  ConfigurePaymentRequest,
  ConfigurePricingRequest,
  CreateListingRequest,
  RegisterProviderRequest,
  RegisterProviderResponse,
} from '@rohankumar4179/shared-types';
import { buildUrl, readError } from './http.js';

export interface PublishCapabilityInput {
  /** Provider identity — same shape `POST /v1/providers/register` takes. A fresh provider account is created per call; reuse `PublishCapabilityResult.apiKey` (not this method) to manage a listing you've already published. */
  provider: RegisterProviderRequest;
  /** The capability being sold — same shape `POST /v1/listings` takes. */
  listing: CreateListingRequest;
  /** Flat pay-per-call price — the only pricing model this platform's payment gate actually enforces today (see PricingModelSchema's own docs). */
  priceUsd: number;
  /** Defaults to `provider.walletAddress` — the common case of "pay the same wallet that just registered." */
  payoutWalletAddress?: string;
  payoutSplitBps?: number;
}

export interface PublishCapabilityResult {
  /** Shown exactly once (the server only ever stores its hash) — persist this to manage the listing later (re-price, re-publish, rotate). */
  apiKey: string;
  providerId: string;
  /** The published listing, including `protocolDocs` (its generated OpenAPI/Swagger/Postman links) and the discovery-catalog fields other agents will see. */
  listing: ApiListingView;
}

/**
 * Lets an agent become a *seller*, not just a buyer — the other half of
 * "agentic commerce." Every step here already exists as a normal,
 * self-service REST call any HTTP client can make (register → verify →
 * create listing → set pricing → set payout → publish — see
 * apps/api/src/routes/control-plane/); none of it required a human before
 * this function existed. This is purely a client-side convenience that
 * wraps the exact same sequence a provider's own dashboard drives, so an
 * agent doesn't have to hand-roll six chained HTTP calls (and their error
 * handling) just to list something for sale.
 *
 * Self-verification (`POST /v1/providers/verify`) has no human review step
 * at this trust tier — see provider-account.route.ts — so the whole flow
 * completes end to end with no human in the loop, the same "agentic
 * commerce" property AgentMarket already gives the *buying* side.
 *
 * Throws (via `readError`) with the server's real error surfaced —
 * including, for a rejected `/publish` call, the exact unmet requirements
 * in `details.requirements` (see listing-publish-gate.ts), so a calling
 * agent can inspect what's missing and retry rather than getting an opaque
 * failure.
 */
export async function publishCapability(
  fetchImpl: typeof fetch,
  baseUrl: string,
  input: PublishCapabilityInput,
): Promise<PublishCapabilityResult> {
  const jsonHeaders = { 'content-type': 'application/json' };

  const registerRes = await fetchImpl(buildUrl(baseUrl, '/v1/providers/register'), {
    method: 'POST',
    headers: jsonHeaders,
    body: JSON.stringify(input.provider),
  });
  if (!registerRes.ok) return readError(registerRes);
  const { providerId, apiKey } = (await registerRes.json()) as RegisterProviderResponse;

  // Bodyless calls (verify, publish) deliberately omit the JSON content-type
  // header — Fastify's default body parser rejects a request that declares
  // `content-type: application/json` but sends no body at all ("Body
  // cannot be empty when content-type is set to 'application/json'"),
  // confirmed against a real running server.
  const authOnlyHeaders = { authorization: `Bearer ${apiKey}` };
  const authHeaders = { ...jsonHeaders, ...authOnlyHeaders };

  const verifyRes = await fetchImpl(buildUrl(baseUrl, '/v1/providers/verify'), { method: 'POST', headers: authOnlyHeaders });
  if (!verifyRes.ok) return readError(verifyRes);

  const createRes = await fetchImpl(buildUrl(baseUrl, '/v1/listings'), {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify(input.listing),
  });
  if (!createRes.ok) return readError(createRes);
  const created = (await createRes.json()) as ApiListingView;

  const pricingBody: ConfigurePricingRequest = { pricingModel: 'pay_per_call', priceUsd: input.priceUsd };
  const pricingRes = await fetchImpl(buildUrl(baseUrl, `/v1/listings/${created.id}/pricing`), {
    method: 'PATCH',
    headers: authHeaders,
    body: JSON.stringify(pricingBody),
  });
  if (!pricingRes.ok) return readError(pricingRes);

  const paymentBody: ConfigurePaymentRequest = {
    payoutWalletAddress: input.payoutWalletAddress ?? input.provider.walletAddress,
    payoutSplitBps: input.payoutSplitBps,
  };
  const paymentRes = await fetchImpl(buildUrl(baseUrl, `/v1/listings/${created.id}/payment`), {
    method: 'PATCH',
    headers: authHeaders,
    body: JSON.stringify(paymentBody),
  });
  if (!paymentRes.ok) return readError(paymentRes);

  const publishRes = await fetchImpl(buildUrl(baseUrl, `/v1/listings/${created.id}/publish`), {
    method: 'POST',
    headers: authOnlyHeaders,
  });
  if (!publishRes.ok) return readError(publishRes);
  const listing = (await publishRes.json()) as ApiListingView;

  return { apiKey, providerId, listing };
}
