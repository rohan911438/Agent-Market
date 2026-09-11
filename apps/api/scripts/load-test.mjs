#!/usr/bin/env node
// Basic load test for the /v1/analyze hot path — rate limiter, x402 payment
// gate (verify + settle), intelligence engine compute, cache, and the DB
// writes (Payment/ApiRequest/Usage) that sit on every metered request.
//
// Prerequisites: apps/api running locally with PAYMENT_PROVIDER=mock (the
// default — see apps/api/.env.example). Start it with `npm run dev`, then in
// a separate terminal:
//   npm run load-test [-- apiUrl durationSeconds connections]
//
// Every request uses a fresh nonce, so almost all of them will settle as new
// payments rather than replay-hit the idempotency cache — this exercises the
// full path, not just the cache-hit fast path. The default anonymous-by-IP
// rate limit (RATE_LIMIT_ANON_PER_MIN=30) will dominate at any real
// throughput since this all comes from one IP; that's expected and is itself
// part of what this script is meant to catch regressions in. To load-test
// past the rate limiter, bump RATE_LIMIT_ANON_PER_MIN in apps/api/.env before
// starting the server.
import autocannon from 'autocannon';
import { encodePaymentPayload } from '@agentmarket/payments';

const API_URL = process.argv[2] ?? 'http://localhost:4000';
const DURATION = Number(process.argv[3] ?? 10);
const CONNECTIONS = Number(process.argv[4] ?? 10);

const SYMBOLS = ['BTC', 'ETH', 'SOL', 'ADA', 'DOGE'];
let counter = 0;

const instance = autocannon(
  {
    url: API_URL,
    connections: CONNECTIONS,
    duration: DURATION,
    requests: [
      {
        method: 'GET',
        setupRequest: (request) => {
          const symbol = SYMBOLS[counter % SYMBOLS.length];
          const nonce = `load-test-${process.pid}-${counter++}`;
          const header = encodePaymentPayload({
            x402Version: 1,
            scheme: 'exact',
            network: 'mock',
            payload: { nonce, address: `LOADTEST${nonce}` },
          });
          request.path = `/v1/analyze?symbol=${symbol}`;
          request.headers = { 'x-payment': header };
          return request;
        },
      },
    ],
  },
  (err) => {
    if (err) {
      console.error(err);
      process.exit(1);
    }
  },
);

autocannon.track(instance, { renderProgressBar: true });
process.once('SIGINT', () => instance.stop());
