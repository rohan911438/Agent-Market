# TestNet demo scripts

Proves the real x402 -> Algorand TestNet facilitator loop end-to-end, outside
of any browser/wallet UI. Wallet secrets never leave this machine — they live
only in `wallets.local.json` (gitignored) and are never printed to stdout.

## One-time setup

```bash
node scripts/testnet/generate-wallet.mjs merchant   # the API's payTo address
node scripts/testnet/generate-wallet.mjs payer      # the demo client wallet
```

Fund both addresses with TestNet ALGO (small amount — covers opt-in +
transaction fees) and fund **payer** with TestNet USDC, using the official
dispenser at https://bank.testnet.algorand.network/ (Google sign-in) or an
equivalent TestNet faucet.

Then opt both wallets into the USDC ASA (asset 10458941):

```bash
node scripts/testnet/opt-in-usdc.mjs merchant
node scripts/testnet/opt-in-usdc.mjs payer
```

## Running the live proof

1. Point `apps/api/.env` at the real facilitator (already set):
   `PAYMENT_PROVIDER=algorand-x402`, `X402_PAY_TO_ADDRESS=<merchant address>`.
2. Start the API: `npm run dev --workspace=@agentmarket/api`
3. Run the proof: `node scripts/testnet/demo-payment.mjs`

This hits `/v1/analyze` with no payment (expect 402), builds and signs a real
USDC transfer with the `payer` wallet using `@x402-avm/avm`'s V1 exact scheme,
resubmits with `X-PAYMENT`, and prints the real settlement response
(including the on-chain transaction id) from the live GoPlausible facilitator.
