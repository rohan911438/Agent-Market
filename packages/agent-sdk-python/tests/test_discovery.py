"""Port of packages/agent-sdk/src/discovery.test.ts."""

import httpx
import pytest

from agentmarket_sdk.discovery import discover_listings
from agentmarket_sdk.types import DiscoverQuery

CATALOG = [
    {
        "id": "1",
        "slug": "risk-analysis",
        "name": "Risk Analysis",
        "description": "Volatility and drawdown scoring",
        "category": "Financial Intelligence",
        "priceUsd": 0.03,
        "endpoint": "/v1/risk-analysis",
        "status": "live",
    },
    {
        "id": "2",
        "slug": "chainscan-wallet-risk",
        "name": "ChainScan Wallet Risk",
        "description": "Flags risky wallets before a payout",
        "category": "Risk & Compliance",
        "priceUsd": 0.03,
        "endpoint": "https://api.ledgerwatch.example",
        "status": "beta",
        "isThirdParty": True,
    },
    {
        "id": "3",
        "slug": "sentiment",
        "name": "Sentiment",
        "description": "Fear & Greed index",
        "category": "Financial Intelligence",
        "priceUsd": 0.02,
        "endpoint": "/v1/sentiment",
        "status": "live",
    },
]


def _client_with_catalog() -> httpx.AsyncClient:
    def handler(_request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, json={"apis": CATALOG})

    return httpx.AsyncClient(transport=httpx.MockTransport(handler))


def _failing_client(status: int) -> httpx.AsyncClient:
    def handler(_request: httpx.Request) -> httpx.Response:
        return httpx.Response(status)

    return httpx.AsyncClient(transport=httpx.MockTransport(handler))


async def test_returns_every_listing_sorted_by_price_ascending_with_no_filters():
    listings = await discover_listings(_client_with_catalog(), "http://fake.local")
    assert [l.slug for l in listings] == ["sentiment", "risk-analysis", "chainscan-wallet-risk"]


async def test_filters_by_category_case_insensitive():
    listings = await discover_listings(_client_with_catalog(), "http://fake.local", DiscoverQuery(category="risk & compliance"))
    assert len(listings) == 1
    assert listings[0].slug == "chainscan-wallet-risk"


async def test_filters_by_a_price_ceiling():
    listings = await discover_listings(_client_with_catalog(), "http://fake.local", DiscoverQuery(max_price_usd=0.02))
    assert [l.slug for l in listings] == ["sentiment"]


async def test_filters_by_a_case_insensitive_substring_search():
    listings = await discover_listings(_client_with_catalog(), "http://fake.local", DiscoverQuery(search="wallet"))
    assert [l.slug for l in listings] == ["chainscan-wallet-risk"]


async def test_raises_when_the_marketplace_endpoint_is_unreachable():
    with pytest.raises(RuntimeError, match="HTTP 500"):
        await discover_listings(_failing_client(500), "http://fake.local")
