#!/usr/bin/env node
// Opts a generated wallet into the USDC ASA for the chosen network so it can
// send/receive USDC. Required once per wallet PER NETWORK before it can pay
// or be paid in USDC. Needs the wallet to already hold a small amount of
// that network's ALGO (covers the opt-in transaction's own network fee +
// the ~0.1 ALGO minimum-balance bump the opt-in adds).
//
// Usage: node scripts/testnet/opt-in-usdc.mjs <label> [network]
//   network: "testnet" (default) | "mainnet"  (or set X402_DEMO_NETWORK)
//   e.g. node scripts/testnet/opt-in-usdc.mjs merchant
//        node scripts/testnet/opt-in-usdc.mjs merchant mainnet
import algosdk from 'algosdk';
import { loadWallets } from './wallet-store.mjs';
import { resolveNetwork } from './network-config.mjs';

const label = process.argv[2];
if (!label) {
  console.error('Usage: node scripts/testnet/opt-in-usdc.mjs <label> [testnet|mainnet]');
  process.exit(1);
}

const net = resolveNetwork(process.argv[3]);
const USDC_ASSET_ID = net.usdcAssetId;

const wallets = loadWallets();
const wallet = wallets[label];
if (!wallet) {
  console.error(`No wallet named "${label}" — run generate-wallet.mjs first.`);
  process.exit(1);
}

const algodClient = new algosdk.Algodv2('', net.algodUrl, '');
const account = algosdk.mnemonicToSecretKey(wallet.mnemonic);

const accountInfo = await algodClient.accountInformation(account.addr).do();
const alreadyOptedIn = (accountInfo.assets ?? []).some(
  (a) => Number(a.assetId ?? a['asset-id']) === USDC_ASSET_ID,
);
if (alreadyOptedIn) {
  console.log(`"${label}" (${wallet.address}) is already opted into ${net.name} USDC (asset ${USDC_ASSET_ID}).`);
  process.exit(0);
}

const suggestedParams = await algodClient.getTransactionParams().do();
const optInTxn = algosdk.makeAssetTransferTxnWithSuggestedParamsFromObject({
  sender: account.addr,
  receiver: account.addr,
  amount: 0,
  assetIndex: USDC_ASSET_ID,
  suggestedParams,
});

const signedTxn = optInTxn.signTxn(account.sk);
const { txid } = await algodClient.sendRawTransaction(signedTxn).do();
await algosdk.waitForConfirmation(algodClient, txid, 4);

console.log(`Opted in "${label}" (${wallet.address}) to ${net.name} USDC (asset ${USDC_ASSET_ID}).`);
console.log(`txId: ${txid}`);
