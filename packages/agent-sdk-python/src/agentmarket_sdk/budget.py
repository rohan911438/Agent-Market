"""Spend-cap tracking — the Python port of `packages/agent-sdk/src/budget.ts`."""

from __future__ import annotations

import datetime as _dt

from .errors import BudgetExceededError
from .types import BudgetConfig


def _utc_date_key(now: _dt.datetime | None = None) -> str:
    return (now or _dt.datetime.now(_dt.timezone.utc)).strftime("%Y-%m-%d")


class Budget:
    """Tracks cumulative spend against `BudgetConfig` caps. Stateful and
    mutable on purpose: construct one `Budget` and pass the *same instance*
    to several `AgentMarketClient`s (see `create_shared_budget`) to give
    them a shared spending ceiling instead of each enforcing its own
    independent cap."""

    def __init__(self, config: BudgetConfig) -> None:
        self._config = config
        self._session_spend_usd = 0.0
        self._daily_spend: dict[str, float] = {}

    def check(self, resource: str, price_usd: float) -> None:
        """Raises BudgetExceededError if spending `price_usd` on `resource` would exceed any configured cap. Does not record the spend — call `record` after the call actually succeeds."""
        if self._config.per_call_usd is not None and price_usd > self._config.per_call_usd:
            raise BudgetExceededError("per_call", self._config.per_call_usd, price_usd, resource)

        if self._config.session_usd is not None:
            would_spend = self._session_spend_usd + price_usd
            if would_spend > self._config.session_usd:
                raise BudgetExceededError("session", self._config.session_usd, would_spend, resource)

        if self._config.daily_usd is not None:
            key = _utc_date_key()
            would_spend = self._daily_spend.get(key, 0.0) + price_usd
            if would_spend > self._config.daily_usd:
                raise BudgetExceededError("daily", self._config.daily_usd, would_spend, resource)

    def record(self, price_usd: float) -> None:
        """Call once a payment actually settles — keeps the caps meaningful even when a call is retried or fails after paying."""
        self._session_spend_usd += price_usd
        key = _utc_date_key()
        self._daily_spend[key] = self._daily_spend.get(key, 0.0) + price_usd

    @property
    def spent_this_session_usd(self) -> float:
        return self._session_spend_usd

    def spent_today_usd(self) -> float:
        return self._daily_spend.get(_utc_date_key(), 0.0)


def create_shared_budget(config: BudgetConfig) -> Budget:
    """One Budget, many agents. Pass the identical returned instance to every client that should draw from the same pool; `Budget` is mutated in place so all holders see each other's spend immediately."""
    return Budget(config)
