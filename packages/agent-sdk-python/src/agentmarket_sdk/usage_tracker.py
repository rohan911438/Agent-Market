"""Client-side call log — the Python port of `packages/agent-sdk/src/usage-tracker.ts`."""

from __future__ import annotations

from .types import ResourceUsage, UsageRecord, UsageSummary


class UsageTracker:
    """Client-side call log — separate from (and much cheaper to query than) the server's own /v1/dashboard, since it's just this process's in-memory history."""

    def __init__(self) -> None:
        self._records: list[UsageRecord] = []

    def record(self, entry: UsageRecord) -> None:
        self._records.append(entry)

    def summary(self) -> UsageSummary:
        by_resource: dict[str, ResourceUsage] = {}
        total_spend_usd = 0.0

        for r in self._records:
            total_spend_usd += r.price_usd
            bucket = by_resource.setdefault(r.resource, ResourceUsage())
            bucket.calls += 1
            bucket.spend_usd += r.price_usd

        return UsageSummary(total_calls=len(self._records), total_spend_usd=total_spend_usd, by_resource=by_resource)

    def history(self) -> tuple[UsageRecord, ...]:
        return tuple(self._records)

    def clear(self) -> None:
        self._records = []
