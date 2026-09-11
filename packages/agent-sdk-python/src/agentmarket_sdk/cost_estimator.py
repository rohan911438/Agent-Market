"""Cost estimation — the Python port of `packages/agent-sdk/src/cost-estimator.ts`."""

from __future__ import annotations

import httpx

from .http import build_url, read_payment_required
from .types import ATOMIC_UNITS_PER_USD, CallParams, CostEstimate


async def estimate_cost(
    http_client: httpx.AsyncClient,
    base_url: str,
    resource: str,
    params: CallParams | None = None,
) -> CostEstimate:
    """Prices a resource without paying for it — x402 already hands this to
    us for free: a request with no X-PAYMENT header gets a 402 back with
    the exact price, and the server never charges (or even logs a payment
    attempt) for that response. No separate pricing endpoint needed."""
    res = await http_client.get(build_url(base_url, resource, params))

    if res.status_code != 402:
        raise RuntimeError(
            f'Expected 402 Payment Required while estimating the cost of "{resource}", '
            f"got HTTP {res.status_code} instead — is this a metered endpoint?"
        )

    body = read_payment_required(res)
    if not body.accepts:
        raise RuntimeError(f'Server returned a 402 for "{resource}" with no payment options in "accepts".')

    requirement = body.accepts[0]
    atomic = float(requirement.amount if requirement.amount is not None else requirement.max_amount_required)
    return CostEstimate(
        resource=resource,
        price_usd=atomic / ATOMIC_UNITS_PER_USD,
        network=requirement.network,
        scheme=requirement.scheme,
    )
