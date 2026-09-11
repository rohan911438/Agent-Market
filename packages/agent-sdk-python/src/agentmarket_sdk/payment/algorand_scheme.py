"""Real Algorand settlement — the Python port of
`packages/agent-sdk/src/payment/algorand-scheme.ts`.

Building the atomic transaction group (the client's ASA transfer, plus the
facilitator's fee-payer leg when fee abstraction applies) is delegated
entirely to `x402-avm`'s `ExactAvmScheme` — GoPlausible's own Python SDK for
the exact facilitator AgentMarket's `algorand-x402` payment provider talks
to (https://pypi.org/project/x402-avm/). Its wire format was verified
against `packages/payments/src/algorand-x402-provider.ts` before writing
this: identical CAIP-2 genesis hashes and identical `paymentGroup`/
`paymentIndex` field names in the payload. This module only adapts field
names between AgentMarket's `PaymentRequirement` and the shape that library
expects — it does not reimplement any transaction-signing logic itself.

Requires the `avm` extra (`pip install agentmarket-sdk[avm]`), which pulls
in `py-algorand-sdk`. Importing this module without that extra installed
raises a clear `ImportError` rather than failing on some unrelated missing
symbol deep inside a call.
"""

from __future__ import annotations

import asyncio
import base64
from typing import Protocol, runtime_checkable

from ..types import PaymentPayload, PaymentRequirement

try:
    from algosdk import account, encoding, mnemonic
    from x402.mechanisms.avm.exact import ExactAvmScheme as _ExactAvmScheme
    from x402.schemas import PaymentRequirements as _PaymentRequirements
except ImportError as exc:  # pragma: no cover — exercised only when the extra is missing
    raise ImportError(
        "AlgorandPaymentScheme requires the 'avm' extra. Install with: pip install agentmarket-sdk[avm]"
    ) from exc


@runtime_checkable
class ClientAvmSigner(Protocol):
    """Matches `x402.mechanisms.avm.signer.ClientAvmSigner` — re-declared
    here so callers can type-hint a bring-your-own signer (e.g. one backed
    by a hosted KMS key) without importing from `x402` directly."""

    @property
    def address(self) -> str: ...

    def sign_transactions(self, unsigned_txns: list[bytes], indexes_to_sign: list[int]) -> list[bytes | None]: ...


class LocalAvmSigner:
    """Holds a raw Algorand private key in process and signs with it.

    `algosdk.encoding.msgpack_decode`/`msgpack_encode` operate on
    *base64-encoded strings*, not raw bytes, despite `ClientAvmSigner`'s
    `sign_transactions` contract being bytes-in/bytes-out (matching what
    `ExactAvmScheme` actually feeds it) — this class does the base64
    round-trip internally so callers on both sides never have to think
    about it.
    """

    def __init__(self, private_key_b64: str) -> None:
        self._private_key = private_key_b64
        self._address = account.address_from_private_key(private_key_b64)

    @property
    def address(self) -> str:
        return self._address

    def sign_transactions(self, unsigned_txns: list[bytes], indexes_to_sign: list[int]) -> list[bytes | None]:
        result: list[bytes | None] = []
        for i, txn_bytes in enumerate(unsigned_txns):
            if i in indexes_to_sign:
                txn = encoding.msgpack_decode(base64.b64encode(txn_bytes).decode("ascii"))
                signed = txn.sign(self._private_key)
                result.append(base64.b64decode(encoding.msgpack_encode(signed)))
            else:
                result.append(None)
        return result


def _resolve_signer(
    mnemonic_phrase: str | None,
    private_key_b64: str | None,
    signer: ClientAvmSigner | None,
) -> ClientAvmSigner:
    if signer is not None:
        return signer
    if private_key_b64 is not None:
        return LocalAvmSigner(private_key_b64)
    if mnemonic_phrase is not None:
        return LocalAvmSigner(mnemonic.to_private_key(mnemonic_phrase))
    raise ValueError("AlgorandPaymentScheme requires one of: mnemonic, private_key_b64, or signer.")


class AlgorandPaymentScheme:
    """Pays against the server's real `algorand-x402` provider — signs and
    settles an actual USDC-on-Algorand transfer through the GoPlausible
    x402 facilitator.

    Needs network access to an Algod node (AlgoNode's public endpoint by
    default) to fetch suggested transaction parameters, and a funded
    TestNet/MainNet account to actually settle — an unfunded account fails
    loudly at that step rather than silently.
    """

    def __init__(
        self,
        *,
        mnemonic: str | None = None,
        private_key_b64: str | None = None,
        signer: ClientAvmSigner | None = None,
        algod_url: str | None = None,
    ) -> None:
        resolved_signer = _resolve_signer(mnemonic, private_key_b64, signer)
        self._scheme = _ExactAvmScheme(resolved_signer, algod_url=algod_url)

    def supports(self, network: str) -> bool:
        return network.startswith("algorand:")

    async def create_payload(self, requirement: PaymentRequirement, x402_version: int) -> PaymentPayload:
        amount = requirement.amount if requirement.amount is not None else requirement.max_amount_required
        requirements = _PaymentRequirements(
            scheme=requirement.scheme,
            network=requirement.network,
            asset=requirement.asset,
            amount=amount,
            pay_to=requirement.pay_to,
            max_timeout_seconds=requirement.max_timeout_seconds,
            extra=requirement.extra or {},
        )

        # ExactAvmScheme.create_payment_payload is synchronous (it makes
        # blocking HTTP calls to Algod for suggested params) — run it off
        # the event loop rather than stalling every other coroutine on this
        # client for the duration of a network round trip.
        inner_payload = await asyncio.to_thread(self._scheme.create_payment_payload, requirements)

        return PaymentPayload(
            x402_version=x402_version,
            scheme=requirement.scheme,
            network=requirement.network,
            payload=inner_payload,
        )
