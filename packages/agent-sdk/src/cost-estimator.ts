import { buildUrl, readPaymentRequired } from './http.js';
import { ATOMIC_UNITS_PER_USD, type CallParams, type CostEstimate } from './types.js';

/**
 * Prices a resource without paying for it — x402 already hands this to us
 * for free: a request with no X-PAYMENT header gets a 402 back with the
 * exact price, and the server never charges (or even logs a payment
 * attempt) for that response. No separate pricing endpoint needed.
 */
export async function estimateCost(
  fetchImpl: typeof fetch,
  baseUrl: string,
  resource: string,
  params?: CallParams,
): Promise<CostEstimate> {
  const res = await fetchImpl(buildUrl(baseUrl, resource, params));

  if (res.status !== 402) {
    throw new Error(
      `Expected 402 Payment Required while estimating the cost of "${resource}", got HTTP ${res.status} instead — is this a metered endpoint?`,
    );
  }

  const body = await readPaymentRequired(res);
  const requirement = body.accepts[0];
  if (!requirement) {
    throw new Error(`Server returned a 402 for "${resource}" with no payment options in "accepts".`);
  }

  const atomic = Number(requirement.amount ?? requirement.maxAmountRequired);
  return {
    resource,
    priceUsd: atomic / ATOMIC_UNITS_PER_USD,
    network: requirement.network,
    scheme: requirement.scheme,
  };
}
