#!/usr/bin/env node
// Proves the native-ALGO x402 leg against the REAL Algorand TestNet
// facilitator: 402 (accepts both USDC and ALGO) -> client signs a plain
// native Payment transaction for the ALGO-denominated requirement -> server
// verifies/settles via the facilitator -> 200 with the actual response.
//
// Prerequisites: same as demo-payment.mjs, except the "payer" wallet only
// needs TestNet ALGO (no USDC opt-in required for this leg).
//
// Usage: node scripts/testnet/demo-payment-algo.mjs [apiUrl] [symbol]
import algosdk from 'algosdk';
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

const account = algosdk.mnemonicToSecretKey(payer.mnemonic);
if (account.addr.toString() !== payer.address) {
  throw new Error(`Derived address ${account.addr.toString()} does not match stored address ${payer.address}`);
}

console.log(`Payer: ${payer.address}`);
console.log(`GET ${API_URL}${RESOURCE_PATH} (no payment)...`);
const initial = await fetch(`${API_URL}${RESOURCE_PATH}`);
if (initial.status !== 402) {
  console.error(`Expected 402, got ${initial.status}:`, await initial.text());
  process.exit(1);
}
const paymentRequired = await initial.json();
const requirement = paymentRequired.accepts.find((r) => r.asset === 'ALGO');
if (!requirement) {
  console.error('No native-ALGO requirement in accepts[]:', paymentRequired.accepts);
  process.exit(1);
}
console.log('ALGO PaymentRequirement:', requirement);

const algodClient = new algosdk.Algodv2('', 'https://testnet-api.algonode.cloud', '');
const suggestedParams = await algodClient.getTransactionParams().do();

const txn = algosdk.makePaymentTxnWithSuggestedParamsFromObject({
  sender: account.addr,
  receiver: requirement.payTo,
  amount: BigInt(requirement.amount ?? requirement.maxAmountRequired),
  suggestedParams,
  note: new TextEncoder().encode(`x402-payment-algo-v${paymentRequired.x402Version}-${Date.now()}`),
});

const signed = algosdk.signTransaction(txn, account.sk);
const paymentGroup = [Buffer.from(signed.blob).toString('base64')];

const paymentPayload = {
  x402Version: paymentRequired.x402Version,
  scheme: requirement.scheme,
  network: requirement.network,
  asset: requirement.asset,
  payload: { paymentGroup, paymentIndex: 0 },
};
const header = Buffer.from(JSON.stringify(paymentPayload), 'utf-8').toString('base64');

console.log('\nSubmitting signed native-ALGO TestNet payment via X-PAYMENT...');
const paid = await fetch(`${API_URL}${RESOURCE_PATH}`, { headers: { 'x-payment': header } });
const body = await paid.json();

console.log(`\nResponse: ${paid.status}`);
console.log(JSON.stringify(body, null, 2));

if (paid.status === 200) {
  console.log('\nReal native-ALGO TestNet payment settled.');
} else {
  console.log('\nPayment did not settle — see response above for the reason.');
  process.exit(1);
}
