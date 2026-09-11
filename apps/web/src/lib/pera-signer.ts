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
        // An empty `signers` array tells Pera to skip this leg (e.g. the
        // facilitator's fee-payer transaction) instead of attempting to sign
        // it with the connected account.
        signers: shouldSign(i) ? undefined : [],
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
