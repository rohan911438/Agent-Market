import { Card, CardBody, CardHeader, CardTitle } from '@/components/ui/card';
import { JsonViewer } from '@/components/ui/json-viewer';

const PAYMENT_REQUIREMENTS_EXAMPLE = {
  x402Version: 1,
  error: 'Payment required — see accepts[] for terms',
  accepts: [
    {
      scheme: 'exact',
      network: 'algorand-testnet',
      maxAmountRequired: '50000',
      resource: '/v1/analyze',
      description: 'Access to /v1/analyze',
      mimeType: 'application/json',
      payTo: 'AGENTMARKET_TESTNET_ADDRESS',
      asset: '10458941',
      maxTimeoutSeconds: 60,
    },
  ],
};

export default function DocsPage() {
  return (
    <div className="mx-auto max-w-4xl space-y-10 px-6 py-12">
      <div>
        <h1 className="text-2xl font-semibold text-white">Documentation</h1>
        <p className="mt-2 text-muted">
          A quick reference for integrating with AgentMarket. The full set — architecture, database
          schema, threat model, deployment guide — lives in <code className="text-accent">/docs</code>{' '}
          in the repository.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Quickstart</CardTitle>
        </CardHeader>
        <CardBody className="space-y-2 text-sm text-muted">
          <p>1. Call any metered endpoint, e.g. <code className="text-accent">GET /v1/analyze?symbol=BTC</code>.</p>
          <p>2. No <code className="text-accent">X-PAYMENT</code> header → the server responds <code className="text-accent">402</code> with payment terms.</p>
          <p>3. Sign an x402 payment and retry the same request with <code className="text-accent">X-PAYMENT</code> set.</p>
          <p>4. The server verifies + settles the payment, then returns the structured JSON.</p>
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>402 response shape</CardTitle>
        </CardHeader>
        <CardBody>
          <JsonViewer data={PAYMENT_REQUIREMENTS_EXAMPLE} />
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Endpoints</CardTitle>
        </CardHeader>
        <CardBody className="space-y-3 text-sm">
          {[
            ['GET /v1/analyze', 'Flagship: action, confidence, risk, reasoning for a symbol.'],
            ['GET /v1/market-summary', 'Price, volume, liquidity, volatility snapshot.'],
            ['GET /v1/sentiment', 'Fear & Greed index plus optional news sentiment.'],
            ['GET /v1/risk-analysis', 'Volatility/liquidity/drawdown risk scoring.'],
            ['GET /v1/technical-summary', 'Trend, momentum, support/resistance.'],
            ['GET /v1/trending-assets', 'Ranked list of currently trending assets.'],
            ['POST /v1/portfolio-health', 'Diversification/risk scoring for a set of holdings.'],
            ['GET /v1/execution-readiness', 'Whether current conditions favor executing now.'],
          ].map(([route, desc]) => (
            <div key={route} className="flex flex-col gap-0.5 border-b border-border pb-3 last:border-0">
              <span className="font-mono text-accent">{route}</span>
              <span className="text-muted">{desc}</span>
            </div>
          ))}
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Rate limits & budgets</CardTitle>
        </CardHeader>
        <CardBody className="space-y-1 text-sm text-muted">
          <p>Anonymous (by IP): 30 requests/minute.</p>
          <p>Wallet-verified (≥1 settled payment): 300 requests/minute.</p>
          <p>Daily spend cap per wallet, configurable server-side (default $50).</p>
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Security model</CardTitle>
        </CardHeader>
        <CardBody className="space-y-1 text-sm text-muted">
          <p>Upstream provider credentials never leave the backend — the browser only ever talks to AgentMarket&apos;s API.</p>
          <p>Every payment reference is unique and idempotent: a retried/replayed X-PAYMENT returns the original response instead of double-charging.</p>
          <p>Every error response is a structured <code className="text-accent">{'{ error: { code, message, requestId } }'}</code> — never a raw stack trace.</p>
        </CardBody>
      </Card>
    </div>
  );
}
