#!/usr/bin/env node
// Proves the full x402 loop against a REAL Algorand TestNet facilitator:
// 402 (no payment) -> client signs a real USDC ASA transfer -> server
// verifies/settles via the facilitator -> 200 with the actual response.
//
// Prerequisites:
//   - apps/api running locally with PAYMENT_PROVIDER=algorand-x402 (see
//     apps/api/.env) pointed at https://facilitator.goplausible.xyz.
//   - The "payer" wallet (scripts/testnet/generate-wallet.mjs payer) holds
//     TestNet ALGO (for its own tiny network fee + min balance) and TestNet
//     USDC, and has opted into the USDC asset
//     (scripts/testnet/opt-in-usdc.mjs payer).
//
// Usage: node scripts/testnet/demo-payment.mjs [apiUrl] [symbol]
// The live GoPlausible facilitator only has its Algorand "exact" scheme
// wired up for x402 v2 (CAIP-2 network + atomic fee-payer group) — confirmed
// empirically; v1 requests get "No facilitator registered" at /verify even
// though v1 entries appear in its /supported discovery listing.
import { ExactAvmScheme } from '@x402-avm/avm/exact/client';
import { ed25519Generator } from '@algorandfoundation/algokit-utils/crypto';
import { encodeAddress } from '@algorandfoundation/algokit-utils/common';
import { bytesForSigning, decodeTransaction, encodeSignedTransaction } from '@algorandfoundation/algokit-utils/transact';
import { loadWallets } from './wallet-store.mjs';

const API_URL = process.argv[2] ?? 'http://localhost:4000';
const SYMBOL = process.argv[3] ?? 'BTC';
const RESOURCE_PATH = `/v1/analyze?symbol=${SYMBOL}`;

const wallets = loadWallets();
const payer = wallets.payer;
if (!payer) {
  console.error('No "payer" wallet found — run: node scripts/testnet/generate-wallet.mjs payer');
  process.exit(1);
}

const secretKey = Buffer.from(payer.secretKeyBase64, 'base64');
const seed = secretKey.subarray(0, 32);
const { ed25519Pubkey, rawEd25519Signer } = ed25519Generator(seed);
const derivedAddress = encodeAddress(ed25519Pubkey);
if (derivedAddress !== payer.address) {
  throw new Error(`Derived address ${derivedAddress} does not match stored address ${payer.address}`);
}

/** @type {import('@x402-avm/avm').ClientAvmSigner} */
const signer = {
  address: derivedAddress,
  async signTransactions(txns, indexesToSign) {
    return Promise.all(
      txns.map(async (txn, i) => {
        if (indexesToSign && !indexesToSign.includes(i)) return null;
        const decoded = decodeTransaction(txn);
        const sig = await rawEd25519Signer(bytesForSigning.transaction(decoded));
        return encodeSignedTransaction({ txn: decoded, sig });
      }),
    );
  },
};

console.log(`Payer: ${payer.address}`);
console.log(`GET ${API_URL}${RESOURCE_PATH} (no payment)...`);
const initial = await fetch(`${API_URL}${RESOURCE_PATH}`);
if (initial.status !== 402) {
  console.error(`Expected 402, got ${initial.status}:`, await initial.text());
  process.exit(1);
}
const paymentRequired = await initial.json();
const requirement = paymentRequired.accepts[0];
console.log('PaymentRequirements:', requirement);

const scheme = new ExactAvmScheme(signer);
// The v2 SDK returns only {x402Version, payload} (see PaymentPayload's core
// v2 shape: {..., accepted, payload}) — our own X-PAYMENT envelope schema
// wants the flat {scheme, network} our server already knows from the
// requirement it just issued, not the SDK's "accepted" wrapper.
const { payload } = await scheme.createPaymentPayload(paymentRequired.x402Version, requirement);
const paymentPayload = {
  x402Version: paymentRequired.x402Version,
  scheme: requirement.scheme,
  network: requirement.network,
  payload,
};
const header = Buffer.from(JSON.stringify(paymentPayload), 'utf-8').toString('base64');

console.log('\nSubmitting signed TestNet payment via X-PAYMENT...');
const paid = await fetch(`${API_URL}${RESOURCE_PATH}`, { headers: { 'x-payment': header } });
const body = await paid.json();

console.log(`\nResponse: ${paid.status}`);
console.log(JSON.stringify(body, null, 2));

if (paid.status === 200) {
  console.log('\nReal TestNet payment settled.');
} else {
  console.log('\nPayment did not settle — see response above for the reason.');
  process.exit(1);
}
