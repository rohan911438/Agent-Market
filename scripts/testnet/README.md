# x402 demo scripts

Proves the real x402 -> Algorand facilitator loop end-to-end, outside of any
browser/wallet UI. Wallet secrets never leave this machine — they live only in
`wallets.local.json` (gitignored) and are never printed to stdout.

Defaults to **TestNet**. Every script that touches the chain takes an optional
trailing `network` arg (`testnet` | `mainnet`), or reads `X402_DEMO_NETWORK`.
The same wallet works on both networks — you just fund and opt-in separately on
each. Override the algod endpoints with `ALGOD_TESTNET_URL` / `ALGOD_MAINNET_URL`.

## One-time setup

```bash
node scripts/testnet/generate-wallet.mjs merchant   # the API's payTo address
node scripts/testnet/generate-wallet.mjs payer      # the demo client wallet
```

Fund both addresses with that network's ALGO (a small amount — covers the
opt-in fee + the ~0.1 ALGO min-balance bump; settlements themselves are
fee-sponsored by the facilitator) and fund **payer** with USDC. On TestNet use
the dispenser at https://bank.testnet.algorand.network/ (Google sign-in).

Opt both wallets into the USDC ASA for the target network (TestNet `10458941`,
MainNet `31566704`):

```bash
node scripts/testnet/opt-in-usdc.mjs merchant            # testnet
node scripts/testnet/opt-in-usdc.mjs payer
node scripts/testnet/opt-in-usdc.mjs merchant mainnet    # mainnet
node scripts/testnet/opt-in-usdc.mjs payer mainnet
```

## Running the live proof

1. Point `apps/api/.env` at the real facilitator and the matching network:
   `PAYMENT_PROVIDER=algorand-x402`, `X402_FACILITATOR_URL=https://facilitator.goplausible.xyz`,
   `X402_PAY_TO_ADDRESS=<merchant address>`, `ALGORAND_NETWORK=testnet|mainnet`,
   `X402_USDC_ASSET_ID=10458941|31566704`, and `X402_FEE_PAYER_ADDRESS=<extra.feePayer
   from GET {facilitator}/supported for that network>`.
2. Start the API: `npm run dev --workspace=@agentmarket/api`
3. Run the proof:

   ```bash
   node scripts/testnet/demo-payment.mjs                                  # testnet
   node scripts/testnet/demo-payment.mjs http://localhost:4000 BTC mainnet
   ```

This hits `/v1/analyze` with no payment (expect 402), checks the quoted
network matches the `network` arg, builds and signs a real USDC transfer with
the `payer` wallet using `@x402-avm/avm`'s v2 exact scheme (against that
network's algod), resubmits with `X-PAYMENT`, and prints the real settlement
response (including the on-chain transaction id) from the live GoPlausible
facilitator.

`demo-payment-algo.mjs` is the native-ALGO variant and is TestNet-only for now
(the live facilitator's `exact` scheme rejects a plain Payment txn).
