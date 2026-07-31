// Shared helpers for the TestNet demo scripts in this directory. Wallet
// secrets (mnemonics) live only in wallets.local.json, which is gitignored —
// never printed to stdout, never committed.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const STORE_PATH = fileURLToPath(new URL('./wallets.local.json', import.meta.url));

export function loadWallets() {
  if (!existsSync(STORE_PATH)) return {};
  return JSON.parse(readFileSync(STORE_PATH, 'utf-8'));
}

export function saveWallets(wallets) {
  writeFileSync(STORE_PATH, JSON.stringify(wallets, null, 2) + '\n', 'utf-8');
}

export { STORE_PATH };
