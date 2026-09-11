"""Catalog discovery — the Python port of `packages/agent-sdk/src/discovery.ts`."""

from __future__ import annotations

import httpx

from .types import DiscoverQuery, MarketplaceListing


async def discover_listings(
    http_client: httpx.AsyncClient,
    base_url: str,
    query: DiscoverQuery | None = None,
) -> list[MarketplaceListing]:
    """Filters the public catalog (`GET /v1/marketplace` — the same read
    model the marketplace *page* renders) client-side. Deliberately simple:
    exact category match, a price ceiling, and a substring search —
    "provider selection" as basic filtering, not semantic/intent ranking."""
    query = query or DiscoverQuery()
    res = await http_client.get(f"{base_url}/v1/marketplace")
    if res.status_code >= 400:
        raise RuntimeError(f"Failed to load the marketplace catalog: HTTP {res.status_code}")

    body = res.json()
    listings = [MarketplaceListing.from_json(api) for api in body.get("apis", [])]
    search = query.search.lower() if query.search else None

    def matches(listing: MarketplaceListing) -> bool:
        if query.category and listing.category.lower() != query.category.lower():
            return False
        if query.max_price_usd is not None and listing.price_usd > query.max_price_usd:
            return False
        if search and search not in f"{listing.name} {listing.description}".lower():
            return False
        return True

    return sorted((listing for listing in listings if matches(listing)), key=lambda listing: listing.price_usd)
