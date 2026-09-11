"""Port of packages/agent-sdk/src/payment/mock-scheme.test.ts."""

from agentmarket_sdk.payment.mock_scheme import MockPaymentScheme
from agentmarket_sdk.types import PaymentRequirement

REQUIREMENT = PaymentRequirement(
    scheme="exact",
    network="mock",
    max_amount_required="20000",
    resource="/v1/sentiment",
    description="Access to /v1/sentiment",
    mime_type="application/json",
    pay_to="MOCK_PAY_TO_ADDRESS",
    asset="MOCK_USDC",
    max_timeout_seconds=60,
)


def test_only_supports_the_mock_network():
    scheme = MockPaymentScheme()
    assert scheme.supports("mock") is True
    assert scheme.supports("algorand:SGO1GKSzyE7IEPItTxCByw9x8FmnrCDexi9/cOUJOiI=") is False


async def test_builds_a_payload_the_server_can_decode():
    scheme = MockPaymentScheme("MY_ADDRESS")
    payload = await scheme.create_payload(REQUIREMENT, 1)
    assert payload.x402_version == 1
    assert payload.scheme == "exact"
    assert payload.network == "mock"
    assert payload.payload["address"] == "MY_ADDRESS"
    assert isinstance(payload.payload["nonce"], str)


async def test_generates_a_fresh_nonce_per_call():
    scheme = MockPaymentScheme()
    a = await scheme.create_payload(REQUIREMENT, 1)
    b = await scheme.create_payload(REQUIREMENT, 1)
    assert a.payload["nonce"] != b.payload["nonce"]
