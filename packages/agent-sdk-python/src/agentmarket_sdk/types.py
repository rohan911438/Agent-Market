"""Wire types and config shapes — the Python-idiomatic equivalent of
`packages/agent-sdk/src/types.ts`. Dataclasses instead of TS interfaces;
`from_json`/`to_json` do the camelCase <-> snake_case translation at the
boundary so everything past that boundary reads like normal Python.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import TYPE_CHECKING, Any, Callable, ClassVar, Protocol, Union, runtime_checkable

if TYPE_CHECKING:
    from .budget import Budget

# USDC (and this SDK's mock currency) both use 6 decimal places — see
# AlgorandX402Provider/MockPaymentProvider on the server.
ATOMIC_UNITS_PER_USD = 1_000_000


@dataclass(frozen=True)
class PaymentRequirement:
    """One entry of a 402 response's `accepts` array. Field names follow the
    public x402 spec (x402.org) on the wire (camelCase); `from_json` maps
    that to idiomatic snake_case attributes."""

    scheme: str
    network: str
    max_amount_required: str
    resource: str
    description: str
    pay_to: str
    asset: str
    amount: str | None = None
    mime_type: str = "application/json"
    max_timeout_seconds: int = 60
    extra: dict[str, Any] | None = None

    @classmethod
    def from_json(cls, data: dict[str, Any]) -> PaymentRequirement:
        return cls(
            scheme=data["scheme"],
            network=data["network"],
            max_amount_required=data["maxAmountRequired"],
            amount=data.get("amount"),
            resource=data["resource"],
            description=data["description"],
            mime_type=data.get("mimeType", "application/json"),
            pay_to=data["payTo"],
            asset=data["asset"],
            max_timeout_seconds=data.get("maxTimeoutSeconds", 60),
            extra=data.get("extra"),
        )


@dataclass(frozen=True)
class PaymentRequiredResponse:
    x402_version: int
    accepts: list[PaymentRequirement]
    error: str | None = None

    @classmethod
    def from_json(cls, data: dict[str, Any]) -> PaymentRequiredResponse:
        return cls(
            x402_version=data["x402Version"],
            accepts=[PaymentRequirement.from_json(a) for a in data["accepts"]],
            error=data.get("error"),
        )


@dataclass(frozen=True)
class PaymentPayload:
    """The decoded contents of the client's X-PAYMENT header."""

    x402_version: int
    scheme: str
    network: str
    payload: dict[str, Any]

    def to_json(self) -> dict[str, Any]:
        return {
            "x402Version": self.x402_version,
            "scheme": self.scheme,
            "network": self.network,
            "payload": self.payload,
        }


@runtime_checkable
class PaymentScheme(Protocol):
    """Builds the signed (or mock) X-PAYMENT payload for one accepted
    requirement. `MockPaymentScheme` and `AlgorandPaymentScheme` both
    implement this — the client never branches on payment method, it just
    asks whichever scheme matches the requirement's network to produce a
    payload."""

    def supports(self, network: str) -> bool:
        """Whether this scheme can pay a requirement advertising this network (e.g. "mock", or an Algorand CAIP-2 id)."""
        ...

    async def create_payload(self, requirement: PaymentRequirement, x402_version: int) -> PaymentPayload:
        """`x402_version` is the server's declared protocol version from the 402 response — echo it back rather than assuming a fixed value."""
        ...


@dataclass
class BudgetConfig:
    per_call_usd: float | None = None
    """Reject any single call priced above this."""
    session_usd: float | None = None
    """Reject a call that would push cumulative session spend above this."""
    daily_usd: float | None = None
    """Reject a call that would push cumulative spend *today* (UTC) above this."""


@dataclass
class RetryConfig:
    max_attempts: int | None = None
    """Total attempts including the first — 1 means "no retries." Default 3."""
    base_delay_ms: int | None = None
    """Base delay before the first retry; doubles each subsequent attempt. Default 250."""
    max_delay_ms: int | None = None
    """Ceiling on the backoff delay regardless of attempt count. Default 4000."""


# --- Event stream -----------------------------------------------------
# One dataclass per event, discriminated by a `type` ClassVar rather than a
# TS-style string-literal union — `isinstance(event, CallSuccessEvent)` reads
# more idiomatically in Python than checking `event.type == "call:success"`,
# though `.type` is still there for anyone who wants to log/dispatch on it.


@dataclass(frozen=True)
class CallStartEvent:
    resource: str
    session_id: str
    call_id: str
    type: ClassVar[str] = "call:start"


@dataclass(frozen=True)
class CallCostKnownEvent:
    resource: str
    call_id: str
    price_usd: float
    type: ClassVar[str] = "call:cost_known"


@dataclass(frozen=True)
class CallPayingEvent:
    resource: str
    call_id: str
    price_usd: float
    type: ClassVar[str] = "call:paying"


@dataclass(frozen=True)
class CallRetryEvent:
    resource: str
    call_id: str
    attempt: int
    reason: str
    type: ClassVar[str] = "call:retry"


@dataclass(frozen=True)
class CallFallbackEvent:
    from_resource: str
    to_resource: str
    call_id: str
    reason: str
    type: ClassVar[str] = "call:fallback"


@dataclass(frozen=True)
class CallSuccessEvent:
    resource: str
    call_id: str
    price_usd: float
    latency_ms: float
    cache_hit: bool
    type: ClassVar[str] = "call:success"


@dataclass(frozen=True)
class CallErrorEvent:
    resource: str
    call_id: str
    error: str
    type: ClassVar[str] = "call:error"


AgentEvent = Union[
    CallStartEvent,
    CallCostKnownEvent,
    CallPayingEvent,
    CallRetryEvent,
    CallFallbackEvent,
    CallSuccessEvent,
    CallErrorEvent,
]
AgentEventListener = Callable[[AgentEvent], None]

CallParams = dict[str, Union[str, int, float, bool, None]]


@dataclass
class CallOptions:
    method: str | None = None  # "GET" | "POST"
    body: Any = None
    retry: RetryConfig | None = None
    """Per-call override of the client's default retry policy."""
    no_cache: bool = False
    """Skip the response cache for this call even if cache_ttl_ms is configured."""


@dataclass
class AgentMarketClientConfig:
    payment_scheme: PaymentScheme
    """How payments get signed. Use `MockPaymentScheme()` for local dev, `AlgorandPaymentScheme(...)` for real settlement."""
    base_url: str = "http://localhost:4000"
    budget: Union["BudgetConfig", "Budget", None] = None
    """Spend limits. Pass the *same* `Budget` instance to multiple clients (see `create_shared_budget`) to cap what a swarm spends in total, not just what each spends individually."""
    retry: RetryConfig | None = None
    session_id: str | None = None
    """Correlates every call made by this client under one id."""
    on_event: AgentEventListener | None = None
    cache_ttl_ms: int | None = None
    """Response cache for identical (resource + params) calls. Off by default."""


@dataclass(frozen=True)
class CostEstimate:
    resource: str
    price_usd: float
    network: str
    scheme: str


@dataclass(frozen=True)
class UsageRecord:
    resource: str
    price_usd: float
    cache_hit: bool
    success: bool
    timestamp: str
    latency_ms: float


@dataclass
class ResourceUsage:
    calls: int = 0
    spend_usd: float = 0.0


@dataclass
class UsageSummary:
    total_calls: int
    total_spend_usd: float
    by_resource: dict[str, ResourceUsage] = field(default_factory=dict)


@dataclass(frozen=True)
class MarketplaceListing:
    id: str
    slug: str
    name: str
    description: str
    category: str
    price_usd: float
    endpoint: str
    status: str
    provider_name: str | None = None
    is_third_party: bool | None = None

    @classmethod
    def from_json(cls, data: dict[str, Any]) -> MarketplaceListing:
        return cls(
            id=data["id"],
            slug=data["slug"],
            name=data["name"],
            description=data["description"],
            category=data["category"],
            price_usd=data["priceUsd"],
            endpoint=data["endpoint"],
            status=data["status"],
            provider_name=data.get("providerName"),
            is_third_party=data.get("isThirdParty"),
        )


@dataclass
class DiscoverQuery:
    category: str | None = None
    max_price_usd: float | None = None
    search: str | None = None
    """Case-insensitive substring match against name + description."""
