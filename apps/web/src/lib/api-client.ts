import { config } from './config';

export interface ApiCallResult<T = unknown> {
  status: number;
  body: T;
  headers: Headers;
}

export interface CallApiOptions {
  method?: 'GET' | 'POST' | 'PATCH';
  xPayment?: string;
  walletAddress?: string;
  /** Proof-of-payment token from a prior settled payment — promotes the caller to the wallet rate-limit tier. */
  walletToken?: string;
  /** Provider control-plane API key — sent as `Authorization: Bearer <key>`. */
  authorization?: string;
  body?: unknown;
}

/**
 * Every call goes through this one client-side function to our backend —
 * the browser never talks to CoinGecko, Binance, or the x402 facilitator
 * directly, and never sees a provider credential.
 */
export async function callApi<T = unknown>(path: string, options: CallApiOptions = {}): Promise<ApiCallResult<T>> {
  const headers: Record<string, string> = {};
  // Fastify's JSON body parser rejects a truly-empty body when Content-Type
  // says otherwise ("Body cannot be empty when content-type is set to
  // 'application/json'") — so this header is only sent when there's
  // actually a body, e.g. a bodyless POST like /v1/providers/verify.
  if (options.body !== undefined) headers['content-type'] = 'application/json';
  if (options.xPayment) headers['x-payment'] = options.xPayment;
  if (options.walletAddress) headers['x-wallet-address'] = options.walletAddress;
  if (options.walletToken) headers['x-wallet-token'] = options.walletToken;
  if (options.authorization) headers.authorization = `Bearer ${options.authorization}`;

  const res = await fetch(`${config.apiUrl}${path}`, {
    method: options.method ?? 'GET',
    headers,
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
  });

  const body = (await res.json().catch(() => ({}))) as T;
  return { status: res.status, body, headers: res.headers };
}
