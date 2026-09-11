"""Error hierarchy — the Python port of `packages/agent-sdk/src/errors.ts`.
Catch `AgentMarketError` to catch everything below it instead of
string-matching messages."""

from __future__ import annotations

from typing import Any, Literal


class AgentMarketError(Exception):
    """Base class for every error this SDK raises."""

    def __init__(self, message: str, code: str) -> None:
        super().__init__(message)
        self.code = code


class BudgetExceededError(AgentMarketError):
    """A call would push spend past a configured Budget cap — raised *before* any payment is constructed or sent."""

    def __init__(self, limit: Literal["per_call", "session", "daily"], limit_usd: float, would_spend_usd: float, resource: str) -> None:
        super().__init__(
            f'Budget exceeded: calling "{resource}" would bring {limit} spend to '
            f"${would_spend_usd:.4f}, over the ${limit_usd:.4f} cap.",
            "BUDGET_EXCEEDED",
        )
        self.limit = limit
        self.limit_usd = limit_usd
        self.would_spend_usd = would_spend_usd
        self.resource = resource


class UnsupportedPaymentSchemeError(AgentMarketError):
    """The server issued payment requirements this client has no scheme for."""

    def __init__(self, network: str) -> None:
        super().__init__(f'No configured payment scheme supports network "{network}".', "UNSUPPORTED_PAYMENT_SCHEME")
        self.network = network


class PaymentFailedError(AgentMarketError):
    """Payment was constructed and sent, but the server rejected it — see `server_code`/`details` for why."""

    def __init__(self, server_code: str, message: str, details: dict[str, Any] | None = None) -> None:
        super().__init__(message, "PAYMENT_FAILED")
        self.server_code = server_code
        self.details = details


class HttpError(AgentMarketError):
    """A non-payment HTTP error (validation, not found, rate limited, internal, ...)."""

    def __init__(self, status_code: int, server_code: str, message: str, details: dict[str, Any] | None = None) -> None:
        super().__init__(message, "HTTP_ERROR")
        self.status_code = status_code
        self.server_code = server_code
        self.details = details


class ProviderAttempt:
    """One entry of an `AllProvidersFailedError`'s attempt list."""

    def __init__(self, resource: str, error: Exception) -> None:
        self.resource = resource
        self.error = error


class AllProvidersFailedError(AgentMarketError):
    """The primary resource and every configured fallback all failed — `attempts` preserves each one's error in order."""

    def __init__(self, attempts: list[ProviderAttempt]) -> None:
        summary = "; ".join(f"{a.resource}: {a.error}" for a in attempts)
        super().__init__(f"All {len(attempts)} provider(s) failed — {summary}", "ALL_PROVIDERS_FAILED")
        self.attempts = attempts
