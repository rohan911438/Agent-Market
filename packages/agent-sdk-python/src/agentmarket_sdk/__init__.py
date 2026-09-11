"""agentmarket_sdk — the demand side of AgentMarket, packaged as Python.

See README.md for the async-first decision and full quickstart.
"""

from .budget import Budget, create_shared_budget
from .client import AgentMarketClient, PendingCall, SyncAgentMarketClient
from .errors import (
    AgentMarketError,
    AllProvidersFailedError,
    BudgetExceededError,
    HttpError,
    PaymentFailedError,
    ProviderAttempt,
    UnsupportedPaymentSchemeError,
)
from .payment.mock_scheme import MockPaymentScheme
from .retry import is_retryable
from .types import (
    ATOMIC_UNITS_PER_USD,
    AgentEvent,
    AgentEventListener,
    BudgetConfig,
    CallErrorEvent,
    CallCostKnownEvent,
    CallFallbackEvent,
    CallOptions,
    CallParams,
    CallPayingEvent,
    CallRetryEvent,
    CallStartEvent,
    CallSuccessEvent,
    CostEstimate,
    DiscoverQuery,
    MarketplaceListing,
    PaymentPayload,
    PaymentRequirement,
    PaymentScheme,
    RetryConfig,
    UsageRecord,
    UsageSummary,
)
from .usage_tracker import UsageTracker

__all__ = [
    "ATOMIC_UNITS_PER_USD",
    "AgentEvent",
    "AgentEventListener",
    "AgentMarketClient",
    "AgentMarketError",
    "AllProvidersFailedError",
    "Budget",
    "BudgetConfig",
    "BudgetExceededError",
    "CallCostKnownEvent",
    "CallErrorEvent",
    "CallFallbackEvent",
    "CallOptions",
    "CallParams",
    "CallPayingEvent",
    "CallRetryEvent",
    "CallStartEvent",
    "CallSuccessEvent",
    "CostEstimate",
    "DiscoverQuery",
    "HttpError",
    "MarketplaceListing",
    "MockPaymentScheme",
    "PaymentFailedError",
    "PaymentPayload",
    "PaymentRequirement",
    "PaymentScheme",
    "PendingCall",
    "ProviderAttempt",
    "RetryConfig",
    "SyncAgentMarketClient",
    "UnsupportedPaymentSchemeError",
    "UsageRecord",
    "UsageSummary",
    "UsageTracker",
    "create_shared_budget",
    "is_retryable",
]

# AlgorandPaymentScheme is intentionally NOT imported here — it requires the
# optional `avm` extra (`pip install agentmarket-sdk[avm]`), and importing
# it eagerly would make the whole package fail to import for anyone who
# only needs MockPaymentScheme. Import it explicitly:
#
#     from agentmarket_sdk.payment.algorand_scheme import AlgorandPaymentScheme
