"""An `httpx.MockTransport`-backed fake implementing just enough of the real
server's x402 contract (402 with `accepts`, then 200 once a well-formed
X-PAYMENT header shows up) to unit test `AgentMarketClient`'s orchestration
— payment construction, budget checks, retries, fallbacks, caching — all of
which are the SDK's own logic, independent of whichever `PaymentScheme`
actually signs the payload.

The Python port of `packages/agent-sdk/src/test-helpers/fake-server.ts`.
`AlgorandPaymentScheme` itself is not exercised here; its correctness rests
on `x402-avm`'s own contract (see the module docstring in
`payment/algorand_scheme.py`, and the real-network payload check performed
during development).
"""

from __future__ import annotations

import base64
import json
from dataclasses import dataclass, field
from typing import Any

import httpx


@dataclass
class FakeResource:
    price_usd: float
    network: str = "mock"
    scheme: str = "exact"
    pay_to: str = "TEST_PAY_TO"
    asset: str = "TEST_ASSET"
    response: Any = field(default_factory=dict)
    """A dict, or a callable taking the decoded X-PAYMENT payload dict and returning the response body."""
    fail_first_n_attempts: int = 0
    """Return a transient 500 for this many attempts before succeeding — exercises retry."""
    reject_payment: bool = False
    """Always reject the payment itself (simulates a bad signature / failed settlement)."""


class FakeServer:
    def __init__(self, resources: dict[str, FakeResource]) -> None:
        self._resources = resources
        self._attempt_counts: dict[str, int] = {}
        self.http_client = httpx.AsyncClient(transport=httpx.MockTransport(self._handle))

    def attempts_for(self, path: str) -> int:
        return self._attempt_counts.get(path, 0)

    def _handle(self, request: httpx.Request) -> httpx.Response:
        path = request.url.path
        resource = self._resources.get(path)

        if resource is None:
            return httpx.Response(404, json={"error": {"code": "NOT_FOUND", "message": f"no fake resource for {path}", "requestId": "test"}})

        payment_header = request.headers.get("x-payment")

        if not payment_header:
            body = {
                "x402Version": 1,
                "accepts": [
                    {
                        "scheme": resource.scheme,
                        "network": resource.network,
                        "maxAmountRequired": str(round(resource.price_usd * 1_000_000)),
                        "amount": str(round(resource.price_usd * 1_000_000)),
                        "resource": path,
                        "description": f"Access to {path}",
                        "mimeType": "application/json",
                        "payTo": resource.pay_to,
                        "asset": resource.asset,
                        "maxTimeoutSeconds": 60,
                    }
                ],
            }
            return httpx.Response(402, json=body)

        count = self._attempt_counts.get(path, 0) + 1
        self._attempt_counts[path] = count

        if resource.fail_first_n_attempts and count <= resource.fail_first_n_attempts:
            return httpx.Response(500, json={"error": {"code": "INTERNAL_ERROR", "message": "simulated transient failure", "requestId": "test"}})

        if resource.reject_payment:
            return httpx.Response(
                402, json={"error": {"code": "PAYMENT_VERIFICATION_FAILED", "message": "simulated payment rejection", "requestId": "test"}}
            )

        payload = json.loads(base64.b64decode(payment_header).decode("utf-8"))
        response_body = resource.response(payload) if callable(resource.response) else resource.response
        return httpx.Response(200, json=response_body)


def create_fake_server(resources: dict[str, FakeResource]) -> FakeServer:
    return FakeServer(resources)
