#!/usr/bin/env node
// Opts a generated TestNet wallet into the TestNet USDC ASA (10458941) so it
// can send/receive it. Required once per wallet before it can pay or be paid
// in USDC. Needs the wallet to already hold a small amount of TestNet ALGO
// (covers the opt-in transaction's own network fee + minimum balance bump).
//
// Usage: node scripts/testnet/opt-in-usdc.mjs <label>
import algosdk from 'algosdk';
import { loadWallets } from './wallet-store.mjs';

const USDC_TESTNET_ASSET_ID = 10458941;
const ALGOD_URL = process.env.ALGOD_TESTNET_URL || 'https://testnet-api.algonode.cloud';

const label = process.argv[2];
if (!label) {
  console.error('Usage: node scripts/testnet/opt-in-usdc.mjs <label>');
  process.exit(1);
}

const wallets = loadWallets();
const wallet = wallets[label];
if (!wallet) {
  console.error(`No wallet named "${label}" — run generate-wallet.mjs first.`);
  process.exit(1);
}

const algodClient = new algosdk.Algodv2('', ALGOD_URL, '');
const account = algosdk.mnemonicToSecretKey(wallet.mnemonic);

const accountInfo = await algodClient.accountInformation(account.addr).do();
const alreadyOptedIn = (accountInfo.assets ?? []).some((a) => Number(a.assetId ?? a['asset-id']) === USDC_TESTNET_ASSET_ID);
if (alreadyOptedIn) {
  console.log(`"${label}" (${wallet.address}) is already opted into USDC.`);
  process.exit(0);
}

const suggestedParams = await algodClient.getTransactionParams().do();
const optInTxn = algosdk.makeAssetTransferTxnWithSuggestedParamsFromObject({
  sender: account.addr,
  receiver: account.addr,
  amount: 0,
  assetIndex: USDC_TESTNET_ASSET_ID,
  suggestedParams,
});

const signedTxn = optInTxn.signTxn(account.sk);
const { txid } = await algodClient.sendRawTransaction(signedTxn).do();
await algosdk.waitForConfirmation(algodClient, txid, 4);

console.log(`Opted in "${label}" (${wallet.address}) to USDC (asset ${USDC_TESTNET_ASSET_ID}).`);
console.log(`txId: ${txid}`);
