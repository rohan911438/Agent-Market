"""HTTP helpers — the Python port of `packages/agent-sdk/src/http.ts`."""

from __future__ import annotations

from typing import NoReturn
from urllib.parse import urlencode

import httpx

from .errors import HttpError, PaymentFailedError
from .types import CallParams, PaymentRequiredResponse

# Codes the payment gate itself raises (see apps/api/src/middleware/x402-payment.ts)
# — as distinct from a plain validation/not-found/rate-limit failure.
PAYMENT_ERROR_CODES = frozenset(
    {"PAYMENT_INVALID", "PAYMENT_VERIFICATION_FAILED", "PAYMENT_ALREADY_SETTLED", "BUDGET_EXCEEDED"}
)


def build_url(base_url: str, resource: str, params: CallParams | None = None) -> str:
    base = resource if resource.startswith("http") else f"{base_url}{'' if resource.startswith('/') else '/'}{resource}"
    if not params:
        return base
    query = urlencode({k: v for k, v in params.items() if v is not None})
    if not query:
        return base
    separator = "&" if "?" in base else "?"
    return f"{base}{separator}{query}"


def read_error(res: httpx.Response) -> NoReturn:
    """Reads a non-2xx, non-402 response body and raises the appropriately-typed error. Always raises — the `NoReturn` type mirrors the TS SDK's `never` so callers can `return read_error(res)`."""
    try:
        body = res.json()
    except ValueError:
        body = {}

    error = body.get("error", {}) if isinstance(body, dict) else {}
    code = error.get("code", "UNKNOWN_ERROR")
    message = error.get("message", f"Request failed with HTTP {res.status_code}")

    if code in PAYMENT_ERROR_CODES:
        raise PaymentFailedError(code, message, error.get("details"))
    raise HttpError(res.status_code, code, message, error.get("details"))


def read_payment_required(res: httpx.Response) -> PaymentRequiredResponse:
    return PaymentRequiredResponse.from_json(res.json())
