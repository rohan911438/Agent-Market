#!/usr/bin/env node
// Generates a new Algorand TestNet account for the AgentMarket x402 demo.
// Usage: node scripts/testnet/generate-wallet.mjs <label>
//   e.g. node scripts/testnet/generate-wallet.mjs merchant
//        node scripts/testnet/generate-wallet.mjs payer
//
// The mnemonic is written to the local, gitignored wallets.local.json and is
// NEVER printed — only the public address goes to stdout, so this is safe to
// run from an assistant/CI session without leaking a key into logs.
import algosdk from 'algosdk';
import { loadWallets, saveWallets, STORE_PATH } from './wallet-store.mjs';

const label = process.argv[2];
if (!label) {
  console.error('Usage: node scripts/testnet/generate-wallet.mjs <label>');
  process.exit(1);
}

const wallets = loadWallets();
if (wallets[label]) {
  console.log(`"${label}" already exists — address: ${wallets[label].address}`);
  console.log(`(refusing to overwrite; delete its entry in ${STORE_PATH} first if you really want a new one)`);
  process.exit(0);
}

const account = algosdk.generateAccount();
const mnemonic = algosdk.secretKeyToMnemonic(account.sk);
// 64-byte secret key (32-byte seed + 32-byte pubkey), base64 — the exact
// format @x402-avm/avm's ClientAvmSigner examples expect (AVM_PRIVATE_KEY).
const secretKeyBase64 = Buffer.from(account.sk).toString('base64');

wallets[label] = { address: account.addr.toString(), mnemonic, secretKeyBase64 };
saveWallets(wallets);

console.log(`Generated TestNet wallet "${label}"`);
console.log(`Address: ${account.addr.toString()}`);
console.log(`(mnemonic written to ${STORE_PATH} — not printed here)`);
