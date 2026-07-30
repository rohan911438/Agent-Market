/**
 * Client-side helper for the demo payment flow. When the backend runs with
 * PAYMENT_PROVIDER=mock (the default), MockPaymentProvider only needs a
 * payload carrying a nonce and the payer's address — so a connected wallet
 * address plus a fresh nonce is enough to exercise the *full* 402 -> pay ->
 * 200 UX without requiring funded TestNet accounts for every visitor.
 *
 * Production mode (PAYMENT_PROVIDER=algorand-x402) expects a real signed
 * on-chain payment transaction per the x402 "exact" scheme; that payload is
 * built with the official x402 client SDK (@x402/fetch / @x402/avm) plus
 * algosdk transaction signing, which is a drop-in replacement for this
 * function — see docs/PAYMENT_FLOW.md.
 */
export function buildDemoPaymentHeader(address: string): string {
  const payload = {
    x402Version: 1,
    scheme: 'exact',
    network: 'mock',
    payload: {
      address,
      nonce: `${address}-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    },
  };
  return typeof window === 'undefined'
    ? Buffer.from(JSON.stringify(payload), 'utf-8').toString('base64')
    : window.btoa(JSON.stringify(payload));
}
