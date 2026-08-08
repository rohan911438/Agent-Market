"""The demand side of the marketplace, packaged as code — the Python port
of `packages/agent-sdk/src/client.ts`.

Async-first: `AgentMarketClient` is built on `httpx.AsyncClient`; every
network-touching method is a coroutine. `SyncAgentMarketClient` is a thin
convenience wrapper for scripts/notebooks that aren't already inside an
event loop — it runs the same async client on a dedicated background loop.
See the README's "Async-first" section for why.
"""

from __future__ import annotations

import asyncio
import base64
import json
import threading
import time
import uuid
from dataclasses import dataclass, field, replace
from datetime import datetime, timezone
from typing import Any

import httpx

from .budget import Budget
from .cost_estimator import estimate_cost
from .discovery import discover_listings
from .errors import AllProvidersFailedError, HttpError, ProviderAttempt, UnsupportedPaymentSchemeError
from .http import build_url, read_error, read_payment_required
from .retry import with_retry
from .types import (
    ATOMIC_UNITS_PER_USD,
    AgentEvent,
    AgentEventListener,
    BudgetConfig,
    CallOptions,
    CallParams,
    CallRetryEvent,
    CallCostKnownEvent,
    CallErrorEvent,
    CallFallbackEvent,
    CallPayingEvent,
    CallStartEvent,
    CallSuccessEvent,
    CostEstimate,
    DiscoverQuery,
    MarketplaceListing,
    PaymentScheme,
    RetryConfig,
    UsageRecord,
    UsageSummary,
)
from .usage_tracker import UsageTracker


def _coerce_budget(budget: BudgetConfig | Budget | dict[str, Any] | None) -> Budget | None:
    if budget is None:
        return None
    if isinstance(budget, Budget):
        return budget
    if isinstance(budget, dict):
        return Budget(BudgetConfig(**budget))
    if isinstance(budget, BudgetConfig):
        return Budget(budget)
    raise TypeError(f"Unsupported budget type: {type(budget)!r}")


def _coerce_retry(retry: RetryConfig | dict[str, Any] | None) -> RetryConfig | None:
    if retry is None:
        return None
    if isinstance(retry, RetryConfig):
        return retry
    if isinstance(retry, dict):
        return RetryConfig(**retry)
    raise TypeError(f"Unsupported retry type: {type(retry)!r}")


def _cache_key_for(resource: str, params: CallParams | None) -> str:
    return f"{resource}?{json.dumps(params or {}, sort_keys=True)}"


@dataclass
class _CacheEntry:
    expires_at: float
    body: Any


@dataclass
class _FallbackSpec:
    resource: str
    params: CallParams | None = None


@dataclass
class _AttemptResult:
    body: Any
    price_usd: float


class PendingCall:
    """A call in progress. `PendingCall` implements Python's `__await__`
    protocol — this is the real Python equivalent of the TS SDK's thenable
    `PendingCall`: `await client.call(...)`, with or without `.fallback()`/
    `.with_retries()` chained first, runs the whole thing; there's no
    separate `.execute()` to remember to call."""

    def __init__(
        self,
        client: AgentMarketClient,
        resource: str,
        params: CallParams | None,
        options: CallOptions,
    ) -> None:
        self._client = client
        self._resource = resource
        self._params = params
        self._options = options
        self._fallbacks: list[_FallbackSpec] = []
        self._call_id = str(uuid.uuid4())
        self._retry_override: RetryConfig | None = None

    def fallback(self, resource: str, params: CallParams | None = None) -> PendingCall:
        """Try `resource` next if the primary (and every earlier fallback) fails. Chainable for a longer chain, tried in the order added."""
        self._fallbacks.append(_FallbackSpec(resource, params))
        return self

    def with_retries(self, max_attempts: int) -> PendingCall:
        """Overrides the client/call-level retry policy's attempt count for this call specifically."""
        base = self._retry_override or self._options.retry or RetryConfig()
        self._retry_override = replace(base, max_attempts=max_attempts)
        return self

    async def _execute(self) -> Any:
        chain: list[_FallbackSpec] = [_FallbackSpec(self._resource, self._params), *self._fallbacks]
        attempts: list[ProviderAttempt] = []

        for i, spec in enumerate(chain):
            try:
                options = replace(self._options, retry=self._retry_override or self._options.retry)
                return await self._client._execute_call(spec.resource, spec.params, options, self._call_id)
            except Exception as error:  # noqa: BLE001 — must catch anything to try the next fallback
                attempts.append(ProviderAttempt(spec.resource, error))
                next_spec = chain[i + 1] if i + 1 < len(chain) else None
                if next_spec is None:
                    break
                self._client._emit(
                    CallFallbackEvent(
                        from_resource=spec.resource,
                        to_resource=next_spec.resource,
                        call_id=self._call_id,
                        reason=str(error),
                    )
                )

        # No fallback was configured at all — surface the original error
        # as-is (a BudgetExceededError should still be catchable as one)
        # rather than always wrapping a single failure in a "providers"
        # error that implies more than one resource was tried.
        if len(attempts) == 1:
            raise attempts[0].error
        raise AllProvidersFailedError(attempts)

    def __await__(self):
        return self._execute().__await__()


class AgentMarketClient:
    """The demand side of the marketplace, packaged as code. One client per
    agent identity/wallet — construct it once, keep calling `.call()`.

    ```python
    agent = AgentMarketClient(payment_scheme=MockPaymentScheme())
    risk = await agent.call("/v1/risk-analysis", {"symbol": "BTC"}).fallback("/v1/portfolio-health")
    ```
    """

    def __init__(
        self,
        *,
        payment_scheme: PaymentScheme,
        base_url: str = "http://localhost:4000",
        budget: BudgetConfig | Budget | dict[str, Any] | None = None,
        retry: RetryConfig | dict[str, Any] | None = None,
        session_id: str | None = None,
        on_event: AgentEventListener | None = None,
        cache_ttl_ms: int | None = None,
        http_client: httpx.AsyncClient | None = None,
    ) -> None:
        self._base_url = base_url.rstrip("/")
        self._payment_scheme = payment_scheme
        self._budget = _coerce_budget(budget)
        self._retry = _coerce_retry(retry)
        self._session_id = session_id or str(uuid.uuid4())
        self._on_event = on_event
        self._cache_ttl_ms = cache_ttl_ms
        self._http = http_client or httpx.AsyncClient()
        self._owns_http_client = http_client is None
        self._cache: dict[str, _CacheEntry] = {}
        self.usage = UsageTracker()

    async def __aenter__(self) -> AgentMarketClient:
        return self

    async def __aexit__(self, *exc_info: object) -> None:
        await self.aclose()

    async def aclose(self) -> None:
        if self._owns_http_client:
            await self._http.aclose()

    def get_session_id(self) -> str:
        """Correlates every call this client makes — see AgentEvent's `call_id`. Pass the same value via `session_id` in the constructor to continue a session across client instances."""
        return self._session_id

    def call(
        self,
        resource: str,
        params: CallParams | None = None,
        *,
        method: str | None = None,
        body: Any = None,
        retry: RetryConfig | dict[str, Any] | None = None,
        no_cache: bool = False,
    ) -> PendingCall:
        """Starts a call. Nothing happens until you `await` it (optionally after chaining `.fallback()`/`.with_retries()`)."""
        options = CallOptions(method=method, body=body, retry=_coerce_retry(retry), no_cache=no_cache)
        return PendingCall(self, resource, params, options)

    async def estimate_cost(self, resource: str, params: CallParams | None = None) -> CostEstimate:
        """Prices a resource without paying for it — see cost_estimator.py."""
        return await estimate_cost(self._http, self._base_url, resource, params)

    async def discover(self, query: DiscoverQuery | None = None) -> list[MarketplaceListing]:
        """Filters the public catalog — see discovery.py."""
        return await discover_listings(self._http, self._base_url, query)

    def get_usage_summary(self) -> UsageSummary:
        return self.usage.summary()

    def _emit(self, event: AgentEvent) -> None:
        if self._on_event:
            self._on_event(event)

    async def _execute_call(self, resource: str, params: CallParams | None, options: CallOptions, call_id: str) -> Any:
        cache_key = _cache_key_for(resource, params) if self._cache_ttl_ms and not options.no_cache else None
        if cache_key:
            cached = self._cache.get(cache_key)
            if cached and cached.expires_at > time.monotonic():
                self.usage.record(
                    UsageRecord(resource=resource, price_usd=0, cache_hit=True, success=True, timestamp=_iso_now(), latency_ms=0)
                )
                self._emit(CallSuccessEvent(resource=resource, call_id=call_id, price_usd=0, latency_ms=0, cache_hit=True))
                return cached.body

        self._emit(CallStartEvent(resource=resource, session_id=self._session_id, call_id=call_id))
        start = time.monotonic()

        try:
            async def attempt(_attempt_number: int) -> _AttemptResult:
                return await self._attempt_call(resource, params, options, call_id)

            def on_retry(attempt_number: int, error: BaseException, _delay_ms: float) -> None:
                self._emit(CallRetryEvent(resource=resource, call_id=call_id, attempt=attempt_number, reason=str(error)))

            result = await with_retry(attempt, options.retry or self._retry, on_retry)

            latency_ms = (time.monotonic() - start) * 1000
            self.usage.record(
                UsageRecord(
                    resource=resource, price_usd=result.price_usd, cache_hit=False, success=True, timestamp=_iso_now(), latency_ms=latency_ms
                )
            )
            self._emit(CallSuccessEvent(resource=resource, call_id=call_id, price_usd=result.price_usd, latency_ms=latency_ms, cache_hit=False))

            if cache_key and self._cache_ttl_ms:
                self._cache[cache_key] = _CacheEntry(expires_at=time.monotonic() + self._cache_ttl_ms / 1000, body=result.body)
            return result.body
        except Exception as error:
            self._emit(CallErrorEvent(resource=resource, call_id=call_id, error=str(error)))
            raise

    async def _attempt_call(self, resource: str, params: CallParams | None, options: CallOptions, call_id: str) -> _AttemptResult:
        url = build_url(self._base_url, resource, params)
        method = options.method or ("POST" if options.body is not None else "GET")

        initial = await self._request(method, url, body=options.body)

        if initial.status_code != 402:
            if not initial.is_success:
                read_error(initial)
            return _AttemptResult(body=initial.json(), price_usd=0.0)

        payment_required = read_payment_required(initial)
        requirement = payment_required.accepts[0] if payment_required.accepts else None
        if requirement is None:
            raise HttpError(402, "PAYMENT_REQUIRED", f'Server returned 402 for "{resource}" with no payment options.')

        price_usd = float(requirement.amount if requirement.amount is not None else requirement.max_amount_required) / ATOMIC_UNITS_PER_USD
        self._emit(CallCostKnownEvent(resource=resource, call_id=call_id, price_usd=price_usd))

        # Checked, not recorded, here — `record` happens only after the
        # paid request actually succeeds, so a failed/retried payment never
        # eats budget it didn't spend.
        if self._budget:
            self._budget.check(resource, price_usd)

        if not self._payment_scheme.supports(requirement.network):
            raise UnsupportedPaymentSchemeError(requirement.network)

        self._emit(CallPayingEvent(resource=resource, call_id=call_id, price_usd=price_usd))
        payload = await self._payment_scheme.create_payload(requirement, payment_required.x402_version)
        payment_header = base64.b64encode(json.dumps(payload.to_json()).encode("utf-8")).decode("ascii")

        paid_res = await self._request(method, url, headers={"x-payment": payment_header}, body=options.body)

        if not paid_res.is_success:
            read_error(paid_res)

        if self._budget:
            self._budget.record(price_usd)
        return _AttemptResult(body=paid_res.json(), price_usd=price_usd)

    async def _request(self, method: str, url: str, *, headers: dict[str, str] | None = None, body: Any = None) -> httpx.Response:
        kwargs: dict[str, Any] = {}
        if headers:
            kwargs["headers"] = headers
        if body is not None:
            kwargs["json"] = body
        return await self._http.request(method, url, **kwargs)


def _iso_now() -> str:
    return datetime.now(timezone.utc).isoformat()


class _BackgroundLoop:
    """A dedicated event loop running on its own thread for the lifetime of
    a `SyncAgentMarketClient` — lets that client's `httpx.AsyncClient`
    (and its cache/budget/usage state) persist across calls instead of
    being torn down and rebuilt by a fresh `asyncio.run()` every time."""

    def __init__(self) -> None:
        self._loop = asyncio.new_event_loop()
        self._thread = threading.Thread(target=self._loop.run_forever, daemon=True)
        self._thread.start()

    def run(self, coro: Any) -> Any:
        return asyncio.run_coroutine_threadsafe(coro, self._loop).result()

    def close(self) -> None:
        self._loop.call_soon_threadsafe(self._loop.stop)
        self._thread.join(timeout=5)


class SyncAgentMarketClient:
    """Thin synchronous convenience wrapper around `AgentMarketClient`, for
    scripts/notebooks that aren't already inside an event loop. Runs the
    same async client on a dedicated background loop so state (budget,
    cache, usage tracker) persists across calls.

    Fallbacks are passed as an explicit list rather than chained with
    `.fallback(...)` — sync code has no equivalent of `await`'s ability to
    defer execution, so there's nothing to chain onto lazily; a list is the
    honest shape for "try these in order" here.

    ```python
    agent = SyncAgentMarketClient(payment_scheme=MockPaymentScheme())
    risk = agent.call("/v1/risk-analysis", {"symbol": "BTC"}, fallbacks=[("/v1/portfolio-health", None)])
    ```
    """

    def __init__(
        self,
        *,
        payment_scheme: PaymentScheme,
        base_url: str = "http://localhost:4000",
        budget: BudgetConfig | Budget | dict[str, Any] | None = None,
        retry: RetryConfig | dict[str, Any] | None = None,
        session_id: str | None = None,
        on_event: AgentEventListener | None = None,
        cache_ttl_ms: int | None = None,
        http_client: httpx.AsyncClient | None = None,
    ) -> None:
        self._bg = _BackgroundLoop()
        self._async = AgentMarketClient(
            payment_scheme=payment_scheme,
            base_url=base_url,
            budget=budget,
            retry=retry,
            session_id=session_id,
            on_event=on_event,
            cache_ttl_ms=cache_ttl_ms,
            http_client=http_client,
        )
        self.usage = self._async.usage

    def call(
        self,
        resource: str,
        params: CallParams | None = None,
        *,
        fallbacks: list[tuple[str, CallParams | None]] | None = None,
        method: str | None = None,
        body: Any = None,
        retry: RetryConfig | dict[str, Any] | None = None,
        no_cache: bool = False,
        max_attempts: int | None = None,
    ) -> Any:
        pending = self._async.call(resource, params, method=method, body=body, retry=retry, no_cache=no_cache)
        for fb_resource, fb_params in fallbacks or []:
            pending.fallback(fb_resource, fb_params)
        if max_attempts is not None:
            pending.with_retries(max_attempts)
        return self._bg.run(pending._execute())

    def estimate_cost(self, resource: str, params: CallParams | None = None) -> CostEstimate:
        return self._bg.run(self._async.estimate_cost(resource, params))

    def discover(self, query: DiscoverQuery | None = None) -> list[MarketplaceListing]:
        return self._bg.run(self._async.discover(query))

    def get_session_id(self) -> str:
        return self._async.get_session_id()

    def get_usage_summary(self) -> UsageSummary:
        return self._async.get_usage_summary()

    def close(self) -> None:
        self._bg.run(self._async.aclose())
        self._bg.close()

    def __enter__(self) -> SyncAgentMarketClient:
        return self

    def __exit__(self, *exc_info: object) -> None:
        self.close()
