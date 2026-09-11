"""Retry policy — the Python port of `packages/agent-sdk/src/retry.ts`.
Keep the payment-failure asymmetry exactly as-is if you touch this: only
`PAYMENT_ALREADY_SETTLED` is retried; everything else that reaches the
payment gate fails identically on a second attempt.
"""

from __future__ import annotations

import asyncio
import random
from typing import Awaitable, Callable, TypeVar

from .errors import HttpError, PaymentFailedError
from .types import RetryConfig

T = TypeVar("T")

DEFAULT_MAX_ATTEMPTS = 3
DEFAULT_BASE_DELAY_MS = 250
DEFAULT_MAX_DELAY_MS = 4000


def _resolve(config: RetryConfig | None) -> tuple[int, int, int]:
    max_attempts = (config.max_attempts if config and config.max_attempts is not None else None) or DEFAULT_MAX_ATTEMPTS
    base_delay_ms = (config.base_delay_ms if config and config.base_delay_ms is not None else None) or DEFAULT_BASE_DELAY_MS
    max_delay_ms = (config.max_delay_ms if config and config.max_delay_ms is not None else None) or DEFAULT_MAX_DELAY_MS
    return max_attempts, base_delay_ms, max_delay_ms


def is_retryable(error: BaseException) -> bool:
    """Whether a failure is worth retrying at all. Validation-shaped
    failures (bad symbol, malformed body, ...) will fail identically on
    attempt two — retrying just burns a rate-limit slot and delays
    surfacing the real problem. Payment and infrastructure failures are
    usually transient, so those *are* retried."""
    if isinstance(error, HttpError):
        if error.status_code == 429:
            return True  # RATE_LIMITED
        if error.status_code >= 500:
            return True
        return False  # 4xx other than 429 is a client-side problem, not transient
    if isinstance(error, PaymentFailedError):
        # PAYMENT_ALREADY_SETTLED is the server's own "retry shortly" — a
        # concurrent-request race on the same paymentRef, not a real
        # failure. Everything else (bad signature, insufficient funds,
        # wallet spend cap) will fail identically on a second attempt, so
        # surface it immediately instead of masking it behind a delay.
        return error.server_code == "PAYMENT_ALREADY_SETTLED"
    # Network-level failures (connection errors, timeouts, DNS) have no HttpError to inspect.
    return True


def delay_for_attempt(attempt: int, base_delay_ms: int, max_delay_ms: int, error: BaseException | None = None) -> float:
    """Reads a server-supplied retry hint ({details: {resetSeconds}}) when present, falling back to exponential backoff otherwise. Returns seconds."""
    if isinstance(error, HttpError) and error.details and isinstance(error.details.get("resetSeconds"), (int, float)):
        return min(error.details["resetSeconds"] * 1000, max_delay_ms) / 1000
    exponential = base_delay_ms * (2 ** (attempt - 1))
    jitter = random.random() * base_delay_ms
    return min(exponential + jitter, max_delay_ms) / 1000


async def with_retry(
    fn: Callable[[int], Awaitable[T]],
    config: RetryConfig | None,
    on_retry: Callable[[int, BaseException, float], None] | None = None,
) -> T:
    """Runs `fn`, retrying on transient failure per `config`. `on_retry`
    fires before each retry's delay so callers can emit a trace event or
    log — it never fires on the final, non-retried failure."""
    max_attempts, base_delay_ms, max_delay_ms = _resolve(config)
    last_error: BaseException | None = None

    for attempt in range(1, max_attempts + 1):
        try:
            return await fn(attempt)
        except Exception as error:  # noqa: BLE001 — genuinely need to inspect/re-raise anything
            last_error = error
            is_last_attempt = attempt == max_attempts
            if is_last_attempt or not is_retryable(error):
                raise

            delay_s = delay_for_attempt(attempt, base_delay_ms, max_delay_ms, error)
            if on_retry:
                on_retry(attempt, error, delay_s * 1000)
            await asyncio.sleep(delay_s)

    # Unreachable — the loop always either returns or raises.
    assert last_error is not None
    raise last_error
