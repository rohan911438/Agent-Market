import { config } from './config';

export interface ApiCallResult<T = unknown> {
  status: number;
  body: T;
  headers: Headers;
}

export interface CallApiOptions {
  method?: 'GET' | 'POST';
  xPayment?: string;
  walletAddress?: string;
  body?: unknown;
}

/**
 * Every call goes through this one client-side function to our backend —
 * the browser never talks to CoinGecko, Binance, or the x402 facilitator
 * directly, and never sees a provider credential.
 */
export async function callApi<T = unknown>(path: string, options: CallApiOptions = {}): Promise<ApiCallResult<T>> {
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (options.xPayment) headers['x-payment'] = options.xPayment;
  if (options.walletAddress) headers['x-wallet-address'] = options.walletAddress;

  const res = await fetch(`${config.apiUrl}${path}`, {
    method: options.method ?? 'GET',
    headers,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

  const body = (await res.json().catch(() => ({}))) as T;
  return { status: res.status, body, headers: res.headers };
}
