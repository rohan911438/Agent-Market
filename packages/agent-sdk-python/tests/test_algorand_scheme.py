"""Unit coverage for the parts of AlgorandPaymentScheme that don't need
network access. `create_payload` itself talks to a real Algod node (see
`payment/algorand_scheme.py`'s module docstring) — its correctness was
verified once against AlgoNode's public TestNet endpoint during
development, the same "not a repeatable automated test" situation the TS
SDK's `AlgorandPaymentScheme` is in relative to `@x402-avm/avm`.
"""

import pytest
from algosdk import account, mnemonic

from agentmarket_sdk.payment.algorand_scheme import AlgorandPaymentScheme, LocalAvmSigner


def test_supports_only_algorand_caip2_networks():
    sk, _ = account.generate_account()
    scheme = AlgorandPaymentScheme(mnemonic=mnemonic.from_private_key(sk))
    assert scheme.supports("algorand:SGO1GKSzyE7IEPItTxCByw9x8FmnrCDexi9/cOUJOiI=") is True
    assert scheme.supports("mock") is False


def test_requires_exactly_one_signer_source():
    with pytest.raises(ValueError, match="mnemonic, private_key_b64, or signer"):
        AlgorandPaymentScheme()


def test_local_avm_signer_derives_the_correct_address_from_a_private_key():
    sk, expected_address = account.generate_account()
    signer = LocalAvmSigner(sk)
    assert signer.address == expected_address


def test_local_avm_signer_signs_only_the_requested_indexes():
    sk, addr = account.generate_account()
    signer = LocalAvmSigner(sk)

    from algosdk import encoding, transaction
    import base64

    sp = transaction.SuggestedParams(fee=1000, flat_fee=True, first=1, last=1000, gh=base64.b64encode(b"0" * 32).decode())
    txn = transaction.PaymentTxn(sender=addr, sp=sp, receiver=addr, amt=0)
    unsigned_bytes = base64.b64decode(encoding.msgpack_encode(txn))

    results = signer.sign_transactions([unsigned_bytes, unsigned_bytes], indexes_to_sign=[0])
    assert results[0] is not None
    assert results[1] is None

    decoded_signed = encoding.msgpack_decode(base64.b64encode(results[0]).decode("ascii"))
    assert decoded_signed.transaction.sender == addr
