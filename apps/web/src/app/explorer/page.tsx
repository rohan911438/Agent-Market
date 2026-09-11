'use client';

import { WalletConnectButton } from '@/components/wallet-connect-button';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardBody, CardHeader, CardTitle } from '@/components/ui/card';
import { JsonViewer } from '@/components/ui/json-viewer';
import { callApi } from '@/lib/api-client';
import { buildDemoPaymentHeader, buildRealPaymentHeader } from '@/lib/x402-client';
import { useWallet } from '@/lib/wallet-context';
import type { PaymentRequiredResponse } from '@agentmarket/shared-types';
import { useState } from 'react';

interface ExplorerEndpoint {
  path: string;
  label: string;
  price: number;
  params: string[];
}

const ENDPOINTS: ExplorerEndpoint[] = [
  { path: '/v1/analyze', label: 'Analyze', price: 0.05, params: ['symbol'] },
  { path: '/v1/market-summary', label: 'Market Summary', price: 0.02, params: ['symbol'] },
  { path: '/v1/sentiment', label: 'Sentiment', price: 0.02, params: [] },
  { path: '/v1/risk-analysis', label: 'Risk Analysis', price: 0.03, params: ['symbol'] },
  { path: '/v1/technical-summary', label: 'Technical Summary', price: 0.03, params: ['symbol'] },
  { path: '/v1/trending-assets', label: 'Trending Assets', price: 0.02, params: [] },
  { path: '/v1/execution-readiness', label: 'Execution Readiness', price: 0.03, params: ['symbol'] },
];

type FlowState = 'idle' | 'requesting' | 'signing' | 'paying' | 'success' | 'error';

export default function ExplorerPage() {
  const { address, walletToken, setWalletToken, getSigner } = useWallet();
  const [endpointIndex, setEndpointIndex] = useState(0);
  const [symbol, setSymbol] = useState('BTC');
  const [state, setState] = useState<FlowState>('idle');
  const [paymentRequirements, setPaymentRequirements] = useState<unknown>(null);
  const [response, setResponse] = useState<unknown>(null);
  const [error, setError] = useState<string | null>(null);

  const endpoint = ENDPOINTS[endpointIndex]!;

  function buildPath(): string {
    const params = new URLSearchParams();
    if (endpoint.params.includes('symbol')) params.set('symbol', symbol);
    const query = params.toString();
    return query ? `${endpoint.path}?${query}` : endpoint.path;
  }

  async function runFlow(): Promise<void> {
    setError(null);
    setResponse(null);
    setPaymentRequirements(null);
    setState('requesting');

    const path = buildPath();
    const first = await callApi(path, { walletAddress: address ?? undefined, walletToken: walletToken ?? undefined });

    if (first.status === 200) {
      setResponse(first.body);
      setState('success');
      return;
    }

    if (first.status !== 402) {
      setError(JSON.stringify(first.body, null, 2));
      setState('error');
      return;
    }

    setPaymentRequirements(first.body);

    if (!address) {
      setError('Connect a wallet to authorize payment, then send the request again.');
      setState('error');
      return;
    }

    const { x402Version, accepts } = first.body as PaymentRequiredResponse;
    const requirement = accepts[0]!;

    let header: string;
    if (requirement.network === 'mock') {
      setState('paying');
      header = buildDemoPaymentHeader(address);
    } else {
      // Real Algorand payment — this is where the Pera signature prompt
      // appears. A user declining it, or any other signing failure, lands
      // in the catch below rather than as a 4xx from the API (the request
      // never gets sent).
      const signer = getSigner();
      if (!signer) {
        setError('Wallet not connected — reconnect and try again.');
        setState('error');
        return;
      }
      setState('signing');
      try {
        header = await buildRealPaymentHeader(signer, x402Version, requirement);
      } catch (err) {
        setError(
          `Signing was cancelled or failed: ${err instanceof Error ? err.message : String(err)}`,
        );
        setState('error');
        return;
      }
      setState('paying');
    }

    const second = await callApi(path, { walletAddress: address, walletToken: walletToken ?? undefined, xPayment: header });

    const newWalletToken = second.headers.get('x-wallet-token');
    if (newWalletToken) setWalletToken(newWalletToken);

    if (second.status === 200) {
      setResponse(second.body);
      setState('success');
    } else {
      setError(JSON.stringify(second.body, null, 2));
      setState('error');
    }
  }

  const busy = state === 'requesting' || state === 'signing' || state === 'paying';

  return (
    <div className="mx-auto max-w-5xl px-6 py-12">
      <h1 className="text-2xl font-semibold text-white">API Explorer</h1>
      <p className="mt-2 max-w-2xl text-muted">
        Pick an endpoint and send a request. You&apos;ll see the real HTTP 402, then AgentMarket authorize
        a payment and retry — exactly what an autonomous agent does, no manual checkout.
      </p>

      <div className="mt-8 grid gap-6 lg:grid-cols-[320px_1fr]">
        <Card className="h-fit">
          <CardHeader>
            <CardTitle>Request</CardTitle>
          </CardHeader>
          <CardBody className="space-y-4">
            <div>
              <label className="mb-1 block text-xs font-medium text-muted">Endpoint</label>
              <select
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-white"
                value={endpointIndex}
                onChange={(e) => setEndpointIndex(Number(e.target.value))}
              >
                {ENDPOINTS.map((ep, i) => (
                  <option key={ep.path} value={i}>
                    {ep.label} — ${ep.price.toFixed(2)}
                  </option>
                ))}
              </select>
            </div>

            {endpoint.params.includes('symbol') && (
              <div>
                <label className="mb-1 block text-xs font-medium text-muted">Symbol</label>
                <input
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-white"
                  value={symbol}
                  onChange={(e) => setSymbol(e.target.value.toUpperCase())}
                  placeholder="BTC"
                />
              </div>
            )}

            {!address && (
              <div className="rounded-lg border border-warning/30 bg-warning/10 p-3 text-xs text-warning">
                <p>Connect a wallet to authorize payment when a 402 is returned.</p>
                <div className="mt-2">
                  <WalletConnectButton />
                </div>
              </div>
            )}

            <Button className="w-full" onClick={() => void runFlow()} disabled={busy}>
              {state === 'requesting' && 'Requesting…'}
              {state === 'signing' && 'Confirm in Pera Wallet…'}
              {state === 'paying' && 'Paying & retrying…'}
              {!busy && 'Send request'}
            </Button>
            {state === 'signing' && (
              <p className="text-center text-xs text-muted">Approve the payment in your Pera Wallet app.</p>
            )}
          </CardBody>
        </Card>

        <div className="space-y-4">
          {paymentRequirements ? (
            <Card>
              <CardHeader className="flex items-center justify-between">
                <CardTitle>402 Payment Required</CardTitle>
                <Badge tone="warning">HTTP 402</Badge>
              </CardHeader>
              <CardBody>
                <JsonViewer data={paymentRequirements} />
              </CardBody>
            </Card>
          ) : null}

          {response ? (
            <Card>
              <CardHeader className="flex items-center justify-between">
                <CardTitle>Response</CardTitle>
                <Badge tone="success">200 OK</Badge>
              </CardHeader>
              <CardBody>
                <JsonViewer data={response} />
              </CardBody>
            </Card>
          ) : null}

          {error ? (
            <Card>
              <CardHeader>
                <CardTitle>Error</CardTitle>
              </CardHeader>
              <CardBody className="whitespace-pre-wrap text-sm text-danger">{error}</CardBody>
            </Card>
          ) : null}

          {!paymentRequirements && !response && !error ? (
            <Card>
              <CardBody className="text-sm text-muted">
                Send a request to see the live 402 → pay → 200 flow.
              </CardBody>
            </Card>
          ) : null}
        </div>
      </div>
    </div>
  );
}
