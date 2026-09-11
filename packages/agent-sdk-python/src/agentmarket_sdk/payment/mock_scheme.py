"""Mock payment scheme — the Python port of `packages/agent-sdk/src/payment/mock-scheme.ts`."""

from __future__ import annotations

import uuid

from ..types import PaymentPayload, PaymentRequirement


class MockPaymentScheme:
    """Pays against the server's MockPaymentProvider — always "settles," no
    network, no funds, no facilitator. This is the right choice for local
    dev against `PAYMENT_PROVIDER=mock`, and what every test in this
    package runs against. It will not work against a server running the
    real `algorand-x402` provider — use `AlgorandPaymentScheme` for that."""

    def __init__(self, address: str | None = None) -> None:
        self._address = address or f"mock-agent-{uuid.uuid4().hex[:8]}"

    def supports(self, network: str) -> bool:
        return network == "mock"

    async def create_payload(self, requirement: PaymentRequirement, x402_version: int) -> PaymentPayload:
        return PaymentPayload(
            x402_version=x402_version,
            scheme=requirement.scheme,
            network=requirement.network,
            payload={"nonce": str(uuid.uuid4()), "address": self._address},
        )
