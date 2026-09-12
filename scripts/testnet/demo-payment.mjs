#!/usr/bin/env node
// Proves the full x402 loop against a REAL Algorand facilitator:
// 402 (no payment) -> client signs a real USDC ASA transfer -> server
// verifies/settles via the facilitator -> 200 with the actual response.
//
// Prerequisites:
//   - apps/api running locally with PAYMENT_PROVIDER=algorand-x402 (see
//     apps/api/.env) pointed at https://facilitator.goplausible.xyz, and its
//     ALGORAND_NETWORK / X402_USDC_ASSET_ID matching the [network] arg below.
//   - The "payer" wallet (scripts/testnet/generate-wallet.mjs payer) holds
//     that network's ALGO (for its min balance) and USDC, and has opted into
//     the USDC asset on that network (scripts/testnet/opt-in-usdc.mjs payer
//     [network]).
//
// Usage: node scripts/testnet/demo-payment.mjs [apiUrl] [symbol] [network]
//   network: "testnet" (default) | "mainnet"  (or set X402_DEMO_NETWORK)
//   e.g. node scripts/testnet/demo-payment.mjs
//        node scripts/testnet/demo-payment.mjs http://localhost:4000 BTC mainnet
//
// The live GoPlausible facilitator only has its Algorand "exact" scheme
// wired up for x402 v2 (CAIP-2 network + atomic fee-payer group) — confirmed
// empirically; v1 requests get "No facilitator registered" at /verify even
// though v1 entries appear in its /supported discovery listing.
import { ExactAvmScheme } from '@x402-avm/avm/exact/client';
import { ed25519Generator } from '@algorandfoundation/algokit-utils/crypto';
import { encodeAddress } from '@algorandfoundation/algokit-utils/common';
import { bytesForSigning, decodeTransaction, encodeSignedTransaction } from '@algorandfoundation/algokit-utils/transact';
import { loadWallets } from './wallet-store.mjs';
import { resolveNetwork } from './network-config.mjs';

const API_URL = process.argv[2] ?? 'http://localhost:4000';
const SYMBOL = process.argv[3] ?? 'BTC';
const net = resolveNetwork(process.argv[4]);
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

console.log(`Network: ${net.name}  (algod ${net.algodUrl})`);
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

// The signed transaction's genesis hash comes from the algod the scheme
// talks to (see below), so it MUST be the same network the API just quoted —
// otherwise the facilitator rejects a testnet-signed txn against mainnet (or
// vice versa).
if (requirement.network !== net.caip2) {
  console.error(
    `\nNetwork mismatch: API issued a "${requirement.network}" requirement but this run targets ${net.name} ` +
      `(${net.caip2}). Point the API's ALGORAND_NETWORK at ${net.name} (or pass the matching [network] arg).`,
  );
  process.exit(1);
}

// Pass the resolved algod URL explicitly: the SDK otherwise defaults every
// network to its testnet endpoint, so a mainnet requirement would still be
// signed with testnet suggested params.
const scheme = new ExactAvmScheme(signer, { algodUrl: net.algodUrl });
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
  // Echoed verbatim from the 402 response. `resource` (the spec's
  // ResourceInfo, carrying the real absolute URL) is what the facilitator's
  // Bazaar extractor actually keys its catalog entry on; `extensions` alone
  // gets validated but produces no catalog record without it. Without both,
  // a real settled payment still succeeds (200 OK) but the facilitator has
  // no discovery info to record: confirmed against the live facilitator,
  // see docs/PAYMENT_FLOW.md's "Bazaar discovery" section.
  ...(paymentRequired.extensions ? { extensions: paymentRequired.extensions } : {}),
  ...(paymentRequired.resource ? { resource: paymentRequired.resource } : {}),
};
const header = Buffer.from(JSON.stringify(paymentPayload), 'utf-8').toString('base64');

console.log(`\nSubmitting signed ${net.name} payment via X-PAYMENT...`);
const paid = await fetch(`${API_URL}${RESOURCE_PATH}`, { headers: { 'x-payment': header } });
const body = await paid.json();

console.log(`\nResponse: ${paid.status}`);
console.log(JSON.stringify(body, null, 2));

if (paid.status === 200) {
  console.log(`\nReal ${net.name} payment settled.`);
} else {
  console.log('\nPayment did not settle — see response above for the reason.');
  process.exit(1);
}
