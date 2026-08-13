import algosdk from 'algosdk';
import type { PeraWalletConnect } from '@perawallet/connect';
import type { ClientAvmSigner } from '@x402-avm/avm';

/**
 * Adapts a connected Pera Wallet session into the `ClientAvmSigner` interface
 * `ExactAvmScheme` (from `@x402-avm/avm`) expects.
 *
 * The unsigned transaction bytes `ExactAvmScheme` hands to `signTransactions`
 * are decoded with `algosdk.decodeUnsignedTransaction`, not
 * `@algorandfoundation/algokit-utils`' own `Transaction` type (which
 * `@x402-avm/avm` uses internally) — Pera's `SignerTransaction.txn` is typed
 * against `algosdk.Transaction` specifically (see
 * `@perawallet/connect`'s own `peerDependencies.algosdk`), and the two
 * packages' `Transaction` classes are not the same object even though both
 * decode the same canonical wire format.
 */
export function peraToClientAvmSigner(pera: PeraWalletConnect, address: string): ClientAvmSigner {
  return {
    address,
    async signTransactions(txns, indexesToSign) {
      const shouldSign = (i: number) => !indexesToSign || indexesToSign.includes(i);

      const group = txns.map((bytes, i) => ({
        txn: algosdk.decodeUnsignedTransaction(bytes),
        // Must always be a non-empty array for legs we want signed, never
        // `undefined`. `PeraWalletConnect.signTransaction`'s compiled bundle
        // resolves each txn's `signers` as
        // `Array.isArray(e.signers) ? e.signers : signerAddress && []` — so
        // when we call `pera.signTransaction(group, address)` below (passing
        // a truthy `address`), any txn left as `signers: undefined` is
        // silently downgraded to `signers: []` (skip) by that fallback,
        // instead of being left for the wallet to sign as the SDK's own
        // type docs promise. Passing our own address explicitly for legs we
        // want signed keeps us on the `Array.isArray` branch and avoids that
        // fallback entirely. An empty array still tells Pera to skip a leg
        // (e.g. the facilitator's fee-payer transaction).
        signers: shouldSign(i) ? [address] : [],
      }));

      const signed = await pera.signTransaction([group], address);

      // Pera's documented return type is a plain `Uint8Array[]`, but it's
      // unclear from the SDK's docs/types alone whether skipped legs come
      // back as `null` placeholders (preserving 1:1 position with the input,
      // the convention algosdk's own `TransactionSigner` interface uses) or
      // are simply omitted (a shorter, signed-only array). Handle both: if
      // the lengths already match, assume position-preserving; otherwise
      // walk a cursor across only the signed positions.
      if (signed.length === txns.length) {
        return signed.map((s: Uint8Array | null, i: number) => (shouldSign(i) ? s : null));
      }
      let cursor = 0;
      return txns.map((_, i) => (shouldSign(i) ? (signed[cursor++] ?? null) : null));
    },
  };
}
