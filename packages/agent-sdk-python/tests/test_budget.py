"""Port of packages/agent-sdk/src/budget.test.ts."""

import pytest

from agentmarket_sdk.budget import Budget
from agentmarket_sdk.errors import BudgetExceededError
from agentmarket_sdk.types import BudgetConfig


def test_allows_a_call_within_every_configured_cap():
    budget = Budget(BudgetConfig(per_call_usd=0.1, session_usd=1, daily_usd=5))
    budget.check("/v1/analyze", 0.05)  # does not raise


def test_rejects_a_single_call_over_the_per_call_cap():
    budget = Budget(BudgetConfig(per_call_usd=0.05))
    with pytest.raises(BudgetExceededError):
        budget.check("/v1/analyze", 0.06)


def test_accumulates_session_spend_and_rejects_once_the_cap_is_crossed():
    budget = Budget(BudgetConfig(session_usd=0.1))
    budget.check("/v1/analyze", 0.06)
    budget.record(0.06)
    with pytest.raises(BudgetExceededError):
        budget.check("/v1/analyze", 0.06)


def test_check_alone_does_not_record_spend():
    budget = Budget(BudgetConfig(session_usd=0.1))
    budget.check("/v1/analyze", 0.06)  # checked, never recorded (call presumably failed downstream)
    budget.check("/v1/analyze", 0.06)  # does not raise
    assert budget.spent_this_session_usd == 0


def test_shares_state_across_every_holder_of_the_same_instance():
    shared = Budget(BudgetConfig(session_usd=0.1))
    agent_a = shared
    agent_b = shared

    agent_a.check("/v1/analyze", 0.06)
    agent_a.record(0.06)

    with pytest.raises(BudgetExceededError):
        agent_b.check("/v1/risk-analysis", 0.06)


def test_tracks_daily_spend_independently_of_session_spend():
    budget = Budget(BudgetConfig(daily_usd=0.1))
    budget.record(0.06)
    assert budget.spent_today_usd() == pytest.approx(0.06)
    with pytest.raises(BudgetExceededError):
        budget.check("/v1/analyze", 0.05)


def test_reports_which_specific_cap_was_exceeded():
    budget = Budget(BudgetConfig(per_call_usd=0.01))
    with pytest.raises(BudgetExceededError) as exc_info:
        budget.check("/v1/analyze", 0.05)
    assert exc_info.value.limit == "per_call"
    assert exc_info.value.limit_usd == 0.01
