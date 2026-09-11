import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardBody } from '@/components/ui/card';
import { JsonViewer } from '@/components/ui/json-viewer';
import Link from 'next/link';

const EXAMPLE_RESPONSE = {
  symbol: 'BTC',
  action: 'BUY',
  confidence: 92,
  risk: 'LOW',
  reason: [
    'Strong upward momentum (+64 score) over the analysis window',
    'Market sentiment is greedy (Fear & Greed 78/100)',
    'Consistent uptrend detected (trend strength 71/100)',
    'Deep liquidity supports efficient execution',
  ],
  marketSummary: 'BTC is trading at $68,420.11, +4.20% (24h).',
  liquidityScore: 88,
  volatility: 27,
  sentiment: { score: 78, label: 'GREED' },
  technicalSummary: 'Trend: UPTREND (strength 71/100). Momentum score 64. Volatility 27/100.',
  recommendation: 'Consider accumulating. Risk level: LOW.',
};

const FLOW_STEPS = [
  { title: 'Call premium endpoint', detail: 'Agent sends a normal HTTPS request — no API key.' },
  { title: '402 Payment Required', detail: 'Server responds with exact price + payment terms.' },
  { title: 'Wallet pays automatically', detail: 'Agent signs an x402 payment and retries with X-PAYMENT.' },
  { title: 'Verified & settled', detail: 'Facilitator verifies + settles on Algorand.' },
  { title: 'Structured JSON', detail: 'Actionable intelligence returned — for humans or agents.' },
];

const ENDPOINTS = [
  { path: '/v1/analyze', label: 'Analyze', price: '$0.05', status: 'live' },
  { path: '/v1/market-summary', label: 'Market Summary', price: '$0.02', status: 'live' },
  { path: '/v1/sentiment', label: 'Sentiment', price: '$0.02', status: 'live' },
  { path: '/v1/risk-analysis', label: 'Risk Analysis', price: '$0.03', status: 'live' },
  { path: '/v1/technical-summary', label: 'Technical Summary', price: '$0.03', status: 'live' },
  { path: '/v1/trending-assets', label: 'Trending Assets', price: '$0.02', status: 'live' },
  { path: '/v1/portfolio-health', label: 'Portfolio Health', price: '$0.04', status: 'live' },
  { path: '/v1/execution-readiness', label: 'Execution Readiness', price: '$0.03', status: 'live' },
];

export default function LandingPage() {
  return (
    <div className="mx-auto max-w-6xl px-6">
      <section className="flex flex-col items-center gap-6 py-24 text-center">
        <Badge tone="accent">x402-native · Algorand · Financial Intelligence</Badge>
        <h1 className="max-w-3xl text-4xl font-bold tracking-tight text-white sm:text-5xl">
          Decision intelligence, not price feeds. Purchased per request, by agents.
        </h1>
        <p className="max-w-2xl text-lg text-muted">
          AgentMarket is an x402-native marketplace for premium AI APIs. No subscriptions, no API keys,
          no monthly billing — every call is an on-chain micropayment settled on Algorand.
        </p>
        <div className="flex gap-3">
          <Link href="/explorer">
            <Button size="lg">Try the API Explorer</Button>
          </Link>
          <Link href="/docs">
            <Button variant="secondary" size="lg">
              Read the docs
            </Button>
          </Link>
        </div>
      </section>

      <section className="grid gap-8 pb-24 md:grid-cols-2">
        <div>
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-accent">Instead of this</h2>
          <Card>
            <CardBody className="font-mono text-sm text-muted">BTC Price = $120,000</CardBody>
          </Card>
          <h2 className="mb-2 mt-6 text-sm font-semibold uppercase tracking-wide text-accent">
            We return this — with the WHY
          </h2>
        </div>
        <JsonViewer data={EXAMPLE_RESPONSE} />
      </section>

      <section className="pb-24">
        <h2 className="mb-8 text-center text-2xl font-semibold text-white">How the x402 payment flow works</h2>
        <div className="grid gap-4 md:grid-cols-5">
          {FLOW_STEPS.map((step, i) => (
            <Card key={step.title}>
              <CardBody>
                <div className="mb-3 flex h-8 w-8 items-center justify-center rounded-full bg-primary/20 text-sm font-semibold text-primary">
                  {i + 1}
                </div>
                <h3 className="mb-1 font-medium text-white">{step.title}</h3>
                <p className="text-sm text-muted">{step.detail}</p>
              </CardBody>
            </Card>
          ))}
        </div>
      </section>

      <section className="pb-24">
        <h2 className="mb-8 text-center text-2xl font-semibold text-white">Financial Intelligence APIs</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {ENDPOINTS.map((api) => (
            <Card key={api.path}>
              <CardBody>
                <div className="mb-2 flex items-center justify-between">
                  <Badge tone={api.status === 'live' ? 'success' : 'warning'}>{api.status}</Badge>
                  <span className="text-sm font-semibold text-accent">{api.price}</span>
                </div>
                <h3 className="font-medium text-white">{api.label}</h3>
                <p className="mt-1 font-mono text-xs text-muted">{api.path}</p>
              </CardBody>
            </Card>
          ))}
        </div>
      </section>
    </div>
  );
}
