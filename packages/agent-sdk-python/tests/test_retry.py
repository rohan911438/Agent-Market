"""Port of packages/agent-sdk/src/retry.test.ts."""

import pytest

from agentmarket_sdk.errors import HttpError, PaymentFailedError
from agentmarket_sdk.retry import is_retryable, with_retry
from agentmarket_sdk.types import RetryConfig


class TestIsRetryable:
    def test_retries_a_429_rate_limit(self):
        assert is_retryable(HttpError(429, "RATE_LIMITED", "slow down")) is True

    def test_retries_a_5xx(self):
        assert is_retryable(HttpError(503, "INTERNAL_ERROR", "oops")) is True

    def test_does_not_retry_a_400_validation_error(self):
        assert is_retryable(HttpError(400, "VALIDATION_ERROR", "bad symbol")) is False

    def test_does_not_retry_a_404(self):
        assert is_retryable(HttpError(404, "NOT_FOUND", "nope")) is False

    def test_retries_payment_already_settled(self):
        assert is_retryable(PaymentFailedError("PAYMENT_ALREADY_SETTLED", "retry shortly")) is True

    def test_does_not_retry_a_rejected_payment_signature(self):
        assert is_retryable(PaymentFailedError("PAYMENT_VERIFICATION_FAILED", "bad signature")) is False

    def test_retries_a_bare_network_error(self):
        assert is_retryable(TypeError("connection failed")) is True


class TestWithRetry:
    async def test_returns_the_result_on_first_success_without_retrying(self):
        calls = 0

        async def fn(_attempt: int) -> str:
            nonlocal calls
            calls += 1
            return "ok"

        result = await with_retry(fn, RetryConfig(max_attempts=3, base_delay_ms=1))
        assert result == "ok"
        assert calls == 1

    async def test_retries_a_transient_failure_and_eventually_succeeds(self):
        calls = 0

        async def fn(_attempt: int) -> str:
            nonlocal calls
            calls += 1
            if calls == 1:
                raise HttpError(500, "INTERNAL_ERROR", "flaky")
            return "ok"

        result = await with_retry(fn, RetryConfig(max_attempts=3, base_delay_ms=1))
        assert result == "ok"
        assert calls == 2

    async def test_gives_up_after_max_attempts_and_raises_the_last_error(self):
        calls = 0

        async def fn(_attempt: int) -> str:
            nonlocal calls
            calls += 1
            raise HttpError(500, "INTERNAL_ERROR", "always fails")

        with pytest.raises(HttpError, match="always fails"):
            await with_retry(fn, RetryConfig(max_attempts=2, base_delay_ms=1))
        assert calls == 2

    async def test_does_not_retry_a_non_retryable_error_even_with_attempts_remaining(self):
        calls = 0

        async def fn(_attempt: int) -> str:
            nonlocal calls
            calls += 1
            raise HttpError(400, "VALIDATION_ERROR", "bad input")

        with pytest.raises(HttpError, match="bad input"):
            await with_retry(fn, RetryConfig(max_attempts=5, base_delay_ms=1))
        assert calls == 1

    async def test_calls_on_retry_before_each_retry_but_never_after_the_final_failure(self):
        retry_calls: list[int] = []

        async def fn(_attempt: int) -> str:
            raise HttpError(500, "INTERNAL_ERROR", "nope")

        def on_retry(attempt: int, _error: BaseException, _delay_ms: float) -> None:
            retry_calls.append(attempt)

        with pytest.raises(HttpError):
            await with_retry(fn, RetryConfig(max_attempts=3, base_delay_ms=1), on_retry)
        assert len(retry_calls) == 2  # fires before retry 2 and retry 3, not after the 3rd failure
