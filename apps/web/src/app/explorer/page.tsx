'use client';

import { WalletConnectButton } from '@/components/wallet-connect-button';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardBody, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { JsonViewer } from '@/components/ui/json-viewer';
import { Select } from '@/components/ui/select';
import { callApi } from '@/lib/api-client';
import { NATIVE_ALGO_ASSET, buildDemoPaymentHeader, buildRealAlgoPaymentHeader, buildRealPaymentHeader } from '@/lib/x402-client';
import { useWallet } from '@/lib/wallet-context';
import type { PaymentRequiredResponse, PaymentRequirement } from '@rohankumar4179/shared-types';
import { AnimatePresence, motion } from 'framer-motion';
import { AlertTriangle, ArrowRight, Hash, Send, ShieldCheck, Wallet, Zap } from 'lucide-react';
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

type FlowState = 'idle' | 'requesting' | 'choosing' | 'signing' | 'paying' | 'success' | 'error';

const STEPS: { key: FlowState[]; label: string; icon: typeof Send }[] = [
  { key: ['requesting'], label: 'Request', icon: Send },
  { key: ['choosing', 'signing'], label: 'Sign', icon: Wallet },
  { key: ['paying'], label: 'Pay & retry', icon: Zap },
  { key: ['success'], label: 'Response', icon: ShieldCheck },
];

/** Friendly label for a PaymentRequirement's asset — USDC vs native ALGO. */
function assetLabel(requirement: { asset: string; amount?: string; maxAmountRequired: string }): string {
  const atomic = Number(requirement.amount ?? requirement.maxAmountRequired);
  if (requirement.asset === NATIVE_ALGO_ASSET) return `${(atomic / 1_000_000).toFixed(4)} ALGO`;
  return `${(atomic / 1_000_000).toFixed(2)} USDC`;
}

export default function ExplorerPage() {
  const { address, walletToken, setWalletToken, getSigner } = useWallet();
  const [endpointIndex, setEndpointIndex] = useState(0);
  const [symbol, setSymbol] = useState('BTC');
  const [state, setState] = useState<FlowState>('idle');
  const [paymentRequirements, setPaymentRequirements] = useState<unknown>(null);
  const [response, setResponse] = useState<unknown>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<{ path: string; x402Version: number; accepts: PaymentRequirement[] } | null>(null);

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
    setPending(null);
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

    if (accepts.length > 1) {
      // More than one accepted payment asset (e.g. USDC and native ALGO) —
      // let the user pick rather than silently defaulting to accepts[0].
      setPending({ path, x402Version, accepts });
      setState('choosing');
      return;
    }

    await payWith(path, x402Version, accepts[0]!);
  }

  async function payWith(path: string, x402Version: number, requirement: PaymentRequirement): Promise<void> {
    if (!address) return;

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
        header =
          requirement.asset === NATIVE_ALGO_ASSET
            ? await buildRealAlgoPaymentHeader(signer, x402Version, requirement)
            : await buildRealPaymentHeader(signer, x402Version, requirement);
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
  const activeStepIndex = STEPS.findIndex((s) => s.key.includes(state));

  return (
    <div className="mx-auto max-w-5xl px-6 py-12">
      <h1 className="font-display text-4xl font-bold tracking-tight text-foreground">API Explorer</h1>
      <p className="mt-2 max-w-2xl text-muted">
        Pick an endpoint and send a request. You&apos;ll see the real HTTP 402, then AgentMarket authorize a
        payment and retry — exactly what an autonomous agent does, no manual checkout.
      </p>

      {/* Flow stepper */}
      <div className="mt-8 flex items-center gap-2 overflow-x-auto pb-1">
        {STEPS.map((step, i) => {
          const isActive = i === activeStepIndex;
          const isDone = state === 'success' ? true : activeStepIndex > i;
          return (
            <div key={step.label} className="flex items-center gap-2">
              <div
                className={`flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
                  isActive
                    ? 'border-primary/40 bg-primary/10 text-primary'
                    : isDone
                      ? 'border-success/30 bg-success-bg text-success'
                      : 'border-border text-muted-2'
                }`}
              >
                <step.icon className="h-3.5 w-3.5" />
                {step.label}
              </div>
              {i < STEPS.length - 1 && <ArrowRight className="h-3.5 w-3.5 shrink-0 text-muted-2" />}
            </div>
          );
        })}
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-[340px_1fr]">
        <Card className="h-fit">
          <CardHeader>
            <CardTitle>Request</CardTitle>
          </CardHeader>
          <CardBody className="space-y-4">
            <Select
              label="Endpoint"
              value={endpointIndex}
              onChange={(e) => setEndpointIndex(Number(e.target.value))}
            >
              {ENDPOINTS.map((ep, i) => (
                <option key={ep.path} value={i}>
                  {ep.label} — ${ep.price.toFixed(2)}
                </option>
              ))}
            </Select>

            {endpoint.params.includes('symbol') && (
              <Input
                label="Symbol"
                icon={<Hash className="h-3.5 w-3.5" />}
                value={symbol}
                onChange={(e) => setSymbol(e.target.value.toUpperCase())}
                placeholder="BTC"
              />
            )}

            {!address && (
              <div className="rounded-lg border border-warning/30 bg-warning-bg p-3 text-xs text-warning">
                <p className="flex items-center gap-1.5">
                  <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                  Connect a wallet to authorize payment when a 402 is returned.
                </p>
                <div className="mt-2">
                  <WalletConnectButton />
                </div>
              </div>
            )}

            <Button
              className="w-full"
              onClick={() => void runFlow()}
              loading={busy}
              disabled={state === 'choosing'}
              icon={!busy ? <Send className="h-4 w-4" /> : undefined}
            >
              {state === 'requesting' && 'Requesting…'}
              {state === 'signing' && 'Confirm in Pera Wallet…'}
              {state === 'paying' && 'Paying & retrying…'}
              {!busy && state !== 'choosing' && 'Send request'}
              {state === 'choosing' && 'Choose a payment asset below'}
            </Button>
            {state === 'signing' && (
              <p className="text-center text-xs text-muted">Approve the payment in your Pera Wallet app.</p>
            )}

            {state === 'choosing' && pending && (
              <div className="space-y-2 rounded-lg border border-border bg-surface-hover p-3">
                <p className="text-xs text-muted">Pay with:</p>
                {pending.accepts.map((requirement) => (
                  <Button
                    key={requirement.asset}
                    variant="secondary"
                    className="w-full justify-between"
                    onClick={() => void payWith(pending.path, pending.x402Version, requirement)}
                  >
                    <span>{requirement.asset === NATIVE_ALGO_ASSET ? 'Native ALGO' : 'USDC'}</span>
                    <span className="font-mono text-xs">{assetLabel(requirement)}</span>
                  </Button>
                ))}
              </div>
            )}
          </CardBody>
        </Card>

        <div className="space-y-4">
          <AnimatePresence mode="popLayout">
            {paymentRequirements ? (
              <motion.div key="402" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
                <Card>
                  <CardHeader className="flex items-center justify-between">
                    <CardTitle>402 Payment Required</CardTitle>
                    <Badge tone="warning">HTTP 402</Badge>
                  </CardHeader>
                  <CardBody>
                    <JsonViewer data={paymentRequirements} />
                  </CardBody>
                </Card>
              </motion.div>
            ) : null}

            {response ? (
              <motion.div key="200" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
                <Card>
                  <CardHeader className="flex items-center justify-between">
                    <CardTitle>Response</CardTitle>
                    <Badge tone="success">200 OK</Badge>
                  </CardHeader>
                  <CardBody>
                    <JsonViewer data={response} />
                  </CardBody>
                </Card>
              </motion.div>
            ) : null}

            {error ? (
              <motion.div key="err" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
                <Card>
                  <CardHeader className="flex items-center justify-between">
                    <CardTitle>Error</CardTitle>
                    <Badge tone="danger">Failed</Badge>
                  </CardHeader>
                  <CardBody className="whitespace-pre-wrap font-mono text-sm text-danger">{error}</CardBody>
                </Card>
              </motion.div>
            ) : null}

            {!paymentRequirements && !response && !error ? (
              <motion.div key="empty" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                <Card>
                  <CardBody className="flex flex-col items-center gap-2 py-12 text-center">
                    <span className="flex h-11 w-11 items-center justify-center rounded-full bg-surface-hover text-muted">
                      <Send className="h-5 w-5" />
                    </span>
                    <p className="text-sm text-muted">Send a request to see the live 402 → pay → 200 flow.</p>
                  </CardBody>
                </Card>
              </motion.div>
            ) : null}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}
