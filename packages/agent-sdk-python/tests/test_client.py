"""Port of packages/agent-sdk/src/client.test.ts."""

from __future__ import annotations

import httpx
import pytest

from agentmarket_sdk.budget import Budget
from agentmarket_sdk.client import AgentMarketClient
from agentmarket_sdk.errors import AllProvidersFailedError, BudgetExceededError, UnsupportedPaymentSchemeError
from agentmarket_sdk.payment.mock_scheme import MockPaymentScheme
from agentmarket_sdk.test_helpers.fake_server import FakeResource, create_fake_server
from agentmarket_sdk.types import BudgetConfig, RetryConfig


def make_client(http_client: httpx.AsyncClient, **overrides) -> AgentMarketClient:
    defaults = dict(
        base_url="http://fake.local",
        payment_scheme=MockPaymentScheme("AGENT_ADDRESS"),
        http_client=http_client,
        retry=RetryConfig(base_delay_ms=1, max_delay_ms=5),
    )
    defaults.update(overrides)
    return AgentMarketClient(**defaults)


class TestThe402PayLoop:
    async def test_pays_for_and_returns_a_metered_resource(self):
        server = create_fake_server({"/v1/sentiment": FakeResource(price_usd=0.02, response={"score": 78, "label": "GREED"})})
        agent = make_client(server.http_client)

        result = await agent.call("/v1/sentiment")
        assert result["score"] == 78

    async def test_never_pays_for_a_free_non_402_resource(self):
        call_count = 0

        def handler(_request: httpx.Request) -> httpx.Response:
            nonlocal call_count
            call_count += 1
            return httpx.Response(200, json={"ok": True})

        http_client = httpx.AsyncClient(transport=httpx.MockTransport(handler))
        agent = make_client(http_client)

        await agent.call("/health")
        assert call_count == 1  # one call, not the usual probe-then-pay two

    async def test_records_real_usage_after_a_successful_paid_call(self):
        server = create_fake_server({"/v1/sentiment": FakeResource(price_usd=0.02, response={"ok": True})})
        agent = make_client(server.http_client)
        await agent.call("/v1/sentiment")

        summary = agent.get_usage_summary()
        assert summary.total_calls == 1
        assert summary.total_spend_usd == pytest.approx(0.02)
        assert summary.by_resource["/v1/sentiment"].calls == 1
        assert summary.by_resource["/v1/sentiment"].spend_usd == pytest.approx(0.02)

    async def test_raises_unsupported_payment_scheme_for_a_network_the_scheme_cannot_pay(self):
        server = create_fake_server(
            {"/v1/sentiment": FakeResource(price_usd=0.02, network="algorand:SGO1GKSzyE7IEPItTxCByw9x8FmnrCDexi9/cOUJOiI=", response={})}
        )
        agent = make_client(server.http_client)  # configured with the mock scheme only

        with pytest.raises(UnsupportedPaymentSchemeError):
            await agent.call("/v1/sentiment")


class TestBudgets:
    async def test_refuses_to_pay_for_a_call_over_the_per_call_cap_before_constructing_a_payment(self):
        server = create_fake_server({"/v1/analyze": FakeResource(price_usd=0.05, response={"ok": True})})
        agent = make_client(server.http_client, budget={"per_call_usd": 0.03})

        with pytest.raises(BudgetExceededError):
            await agent.call("/v1/analyze")
        assert server.attempts_for("/v1/analyze") == 0  # the 402 probe happened, but payment was never sent

    async def test_shares_a_spend_cap_across_two_clients_given_the_same_budget_instance(self):
        server = create_fake_server(
            {
                "/v1/a": FakeResource(price_usd=0.06, response={"ok": True}),
                "/v1/b": FakeResource(price_usd=0.06, response={"ok": True}),
            }
        )
        shared_budget = Budget(BudgetConfig(session_usd=0.1))
        agent_a = make_client(server.http_client, budget=shared_budget)
        agent_b = make_client(server.http_client, budget=shared_budget)

        await agent_a.call("/v1/a")  # spends 0.06 of the shared 0.10
        with pytest.raises(BudgetExceededError):
            await agent_b.call("/v1/b")  # would bring shared total to 0.12


class TestRetries:
    async def test_retries_a_transient_500_and_succeeds_on_a_later_attempt(self):
        server = create_fake_server({"/v1/flaky": FakeResource(price_usd=0.01, response={"ok": True}, fail_first_n_attempts=2)})
        agent = make_client(server.http_client)

        result = await agent.call("/v1/flaky")
        assert result["ok"] is True
        assert server.attempts_for("/v1/flaky") == 3

    async def test_does_not_retry_a_rejected_payment_signature(self):
        server = create_fake_server({"/v1/bad-pay": FakeResource(price_usd=0.01, response={}, reject_payment=True)})
        agent = make_client(server.http_client)

        with pytest.raises(Exception, match="rejection"):
            await agent.call("/v1/bad-pay")
        assert server.attempts_for("/v1/bad-pay") == 1


class TestFallbackChains:
    async def test_falls_through_to_a_fallback_when_the_primary_fails(self):
        server = create_fake_server(
            {
                "/v1/primary": FakeResource(price_usd=0.03, response={}, reject_payment=True),
                "/v1/backup": FakeResource(price_usd=0.03, response={"source": "backup"}),
            }
        )
        agent = make_client(server.http_client)

        result = await agent.call("/v1/primary").fallback("/v1/backup")
        assert result["source"] == "backup"

    async def test_raises_all_providers_failed_with_every_attempt_recorded(self):
        server = create_fake_server(
            {
                "/v1/primary": FakeResource(price_usd=0.01, response={}, reject_payment=True),
                "/v1/backup": FakeResource(price_usd=0.01, response={}, reject_payment=True),
            }
        )
        agent = make_client(server.http_client)

        with pytest.raises(AllProvidersFailedError) as exc_info:
            await agent.call("/v1/primary").fallback("/v1/backup")
        assert [a.resource for a in exc_info.value.attempts] == ["/v1/primary", "/v1/backup"]

    async def test_a_single_resource_with_no_fallback_surfaces_its_original_error_type(self):
        """The bug the TS SDK's tests caught: a lone failure must surface as
        its original error type, not always wrapped in AllProvidersFailedError
        — `except BudgetExceededError:` must work whether or not a
        `.fallback()` was ever added."""
        server = create_fake_server({"/v1/analyze": FakeResource(price_usd=0.05, response={"ok": True})})
        agent = make_client(server.http_client, budget={"per_call_usd": 0.03})

        with pytest.raises(BudgetExceededError):
            await agent.call("/v1/analyze")  # no .fallback() configured at all

    async def test_never_touches_a_fallback_if_the_primary_succeeds(self):
        server = create_fake_server(
            {
                "/v1/primary": FakeResource(price_usd=0.01, response={"ok": True}),
                "/v1/backup": FakeResource(price_usd=0.01, response={"ok": True}),
            }
        )
        agent = make_client(server.http_client)

        await agent.call("/v1/primary").fallback("/v1/backup")
        assert server.attempts_for("/v1/backup") == 0


class TestCostEstimation:
    async def test_reports_the_real_price_without_paying(self):
        server = create_fake_server({"/v1/analyze": FakeResource(price_usd=0.05, response={})})
        agent = make_client(server.http_client)

        estimate = await agent.estimate_cost("/v1/analyze")
        assert estimate.price_usd == pytest.approx(0.05)
        assert server.attempts_for("/v1/analyze") == 0


class TestResponseCaching:
    async def test_serves_a_repeated_identical_call_from_cache_without_a_second_payment(self):
        server = create_fake_server({"/v1/sentiment": FakeResource(price_usd=0.02, response={"score": 50})})
        agent = make_client(server.http_client, cache_ttl_ms=60_000)

        await agent.call("/v1/sentiment")
        await agent.call("/v1/sentiment")

        assert server.attempts_for("/v1/sentiment") == 1
        summary = agent.get_usage_summary()
        assert summary.total_calls == 2
        assert summary.total_spend_usd == pytest.approx(0.02)  # second call was free (served from cache)

    async def test_bypasses_the_cache_when_no_cache_is_set(self):
        server = create_fake_server({"/v1/sentiment": FakeResource(price_usd=0.02, response={"score": 50})})
        agent = make_client(server.http_client, cache_ttl_ms=60_000)

        await agent.call("/v1/sentiment")
        await agent.call("/v1/sentiment", no_cache=True)

        assert server.attempts_for("/v1/sentiment") == 2


class TestEventStream:
    async def test_emits_a_coherent_start_cost_known_paying_success_sequence(self):
        server = create_fake_server({"/v1/sentiment": FakeResource(price_usd=0.02, response={"ok": True})})
        events: list[str] = []
        agent = make_client(server.http_client, on_event=lambda e: events.append(e.type))

        await agent.call("/v1/sentiment")
        assert events == ["call:start", "call:cost_known", "call:paying", "call:success"]

    async def test_emits_call_fallback_when_moving_to_the_next_resource(self):
        server = create_fake_server(
            {
                "/v1/primary": FakeResource(price_usd=0.01, response={}, reject_payment=True),
                "/v1/backup": FakeResource(price_usd=0.01, response={"ok": True}),
            }
        )
        events: list = []
        agent = make_client(server.http_client, on_event=lambda e: events.append(e))

        await agent.call("/v1/primary").fallback("/v1/backup")
        fallback_event = next((e for e in events if e.type == "call:fallback"), None)
        assert fallback_event is not None
        assert fallback_event.from_resource == "/v1/primary"
        assert fallback_event.to_resource == "/v1/backup"
