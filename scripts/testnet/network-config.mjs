// Network selection shared by the demo scripts. These started life as
// TestNet-only, so `testnet` stays the default — pass `mainnet` as the
// network arg (or set X402_DEMO_NETWORK=mainnet) to target the live network
// used by the Global x402 Challenge.
//
// Algorand accounts are network-agnostic: the same wallet label works on
// both networks, you just fund + opt-in separately on each.

const NETWORKS = {
  testnet: {
    name: 'testnet',
    // USDC ASA ids differ per network.
    usdcAssetId: 10458941,
    // CAIP-2 (genesis-hash) id the GoPlausible facilitator issues in its 402.
    caip2: 'algorand:SGO1GKSzyE7IEPItTxCByw9x8FmnrCDexi9/cOUJOiI=',
    algodUrl: process.env.ALGOD_TESTNET_URL || 'https://testnet-api.algonode.cloud',
    faucet: 'https://bank.testnet.algorand.network/',
    real: false,
  },
  mainnet: {
    name: 'mainnet',
    usdcAssetId: 31566704,
    caip2: 'algorand:wGHE2Pwdvd7S12BL5FaOP20EGYesN73ktiC1qzkkit8=',
    algodUrl: process.env.ALGOD_MAINNET_URL || 'https://mainnet-api.algonode.cloud',
    faucet: null,
    real: true,
  },
};

/**
 * Resolve a network from an explicit CLI arg, else X402_DEMO_NETWORK, else
 * "testnet". Exits with a clear message on an unknown value.
 */
export function resolveNetwork(arg) {
  const key = String(arg || process.env.X402_DEMO_NETWORK || 'testnet').toLowerCase();
  const net = NETWORKS[key];
  if (!net) {
    console.error(`Unknown network "${key}" — use "testnet" or "mainnet".`);
    process.exit(1);
  }
  if (net.real) {
    console.warn('⚠  MAINNET selected — this spends REAL ALGO and REAL USDC. Ctrl+C now to abort.\n');
  }
  return net;
}
