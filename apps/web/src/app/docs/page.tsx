import { Badge } from '@/components/ui/badge';
import { Card, CardBody } from '@/components/ui/card';
import { CopyButton } from '@/components/ui/copy-button';
import { JsonViewer } from '@/components/ui/json-viewer';
import { Table, TableBody, TableCell, TableHead, TableHeaderCell, TableRow } from '@/components/ui/table';
import { TerminalWindow } from '@/components/ui/terminal-window';
import {
  ArrowRight,
  BookOpen,
  Compass,
  Gauge,
  ListTree,
  LockKeyhole,
  Rocket,
  ShieldCheck,
  Store,
} from 'lucide-react';
import Link from 'next/link';

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

const QUICKSTART_SNIPPET = `curl "https://api.agentmarket.dev/v1/analyze?symbol=BTC"
# -> 402 Payment Required, see accepts[] for terms

# sign an x402 payment, then retry with the header:
curl "https://api.agentmarket.dev/v1/analyze?symbol=BTC" \\
  -H "X-PAYMENT: <signed-payment>"`;

const QUICKSTART_STEPS = [
  { title: 'Call any metered endpoint', detail: 'e.g. GET /v1/analyze?symbol=BTC — no API key required.' },
  { title: 'Receive a 402', detail: 'No X-PAYMENT header sent → the server responds 402 with payment terms.' },
  { title: 'Sign and retry', detail: 'Sign an x402 payment and retry the same request with X-PAYMENT set.' },
  { title: 'Get your data', detail: 'The server verifies + settles the payment, then returns structured JSON.' },
];

const ENDPOINTS = [
  { method: 'GET', route: '/v1/analyze', desc: 'Flagship: action, confidence, risk, reasoning for a symbol.' },
  { method: 'GET', route: '/v1/market-summary', desc: 'Price, volume, liquidity, volatility snapshot.' },
  { method: 'GET', route: '/v1/sentiment', desc: 'Fear & Greed index plus optional news sentiment.' },
  { method: 'GET', route: '/v1/risk-analysis', desc: 'Volatility/liquidity/drawdown risk scoring.' },
  { method: 'GET', route: '/v1/technical-summary', desc: 'Trend, momentum, support/resistance.' },
  { method: 'GET', route: '/v1/trending-assets', desc: 'Ranked list of currently trending assets.' },
  { method: 'POST', route: '/v1/portfolio-health', desc: 'Diversification/risk scoring for a set of holdings.' },
  { method: 'GET', route: '/v1/execution-readiness', desc: 'Whether current conditions favor executing now.' },
];

const NAV_GROUPS = [
  {
    label: 'Overview',
    items: [{ id: 'quickstart', label: 'Quickstart', icon: Rocket }],
  },
  {
    label: 'Reference',
    items: [
      { id: 'response-shape', label: '402 response shape', icon: BookOpen },
      { id: 'endpoints', label: 'Endpoints', icon: ListTree },
      { id: 'rate-limits', label: 'Rate limits & budgets', icon: Gauge },
      { id: 'security', label: 'Security model', icon: ShieldCheck },
    ],
  },
];

const TOC = NAV_GROUPS.flatMap((g) => g.items);

export default function DocsPage() {
  return (
    <div className="mx-auto max-w-7xl px-6 py-12">
      <div className="grid gap-10 lg:grid-cols-[220px_1fr_180px]">
        {/* Left nav */}
        <aside className="hidden lg:block">
          <nav className="sticky top-24 space-y-6">
            {NAV_GROUPS.map((group) => (
              <div key={group.label}>
                <p className="mb-2 px-2.5 text-xs font-semibold uppercase tracking-wider text-muted-2">
                  {group.label}
                </p>
                <div className="space-y-0.5">
                  {group.items.map((item) => (
                    <a
                      key={item.id}
                      href={`#${item.id}`}
                      className="flex items-center gap-2 rounded-md border-l-2 border-transparent px-2.5 py-1.5 text-sm text-muted transition-colors hover:border-primary/40 hover:bg-surface-hover hover:text-foreground"
                    >
                      <item.icon className="h-3.5 w-3.5 shrink-0" />
                      {item.label}
                    </a>
                  ))}
                </div>
              </div>
            ))}
          </nav>
        </aside>

        {/* Content */}
        <div className="min-w-0">
          <Badge tone="ai" icon={<Compass className="h-3 w-3" />}>
            Documentation
          </Badge>
          <h1 className="mt-4 font-display text-4xl font-bold tracking-tight text-foreground sm:text-5xl">
            AgentMarket Docs
          </h1>
          <p className="mt-3 max-w-2xl text-lg leading-relaxed text-muted">
            Everything you need to call, pay for, and integrate AgentMarket&apos;s x402-native intelligence
            APIs — whether you&apos;re sending your first request or wiring an autonomous agent.
          </p>

          <div className="mt-8 grid gap-4 sm:grid-cols-2">
            <Link href="/explorer" className="group">
              <Card interactive className="h-full">
                <CardBody>
                  <div className="mb-3 flex h-9 w-9 items-center justify-center rounded-full bg-primary/10 text-primary">
                    <Rocket className="h-4 w-4" />
                  </div>
                  <h3 className="flex items-center gap-1.5 font-semibold text-foreground">
                    Send your first request
                    <ArrowRight className="h-3.5 w-3.5 text-muted-2 transition-transform group-hover:translate-x-0.5" />
                  </h3>
                  <p className="mt-1 text-sm text-muted">
                    Pick an endpoint in the API Explorer and watch the real 402 → pay → 200 flow.
                  </p>
                </CardBody>
              </Card>
            </Link>
            <Link href="/marketplace" className="group">
              <Card interactive className="h-full">
                <CardBody>
                  <div className="mb-3 flex h-9 w-9 items-center justify-center rounded-full bg-accent/10 text-accent">
                    <Store className="h-4 w-4" />
                  </div>
                  <h3 className="flex items-center gap-1.5 font-semibold text-foreground">
                    Browse the marketplace
                    <ArrowRight className="h-3.5 w-3.5 text-muted-2 transition-transform group-hover:translate-x-0.5" />
                  </h3>
                  <p className="mt-1 text-sm text-muted">
                    See every live endpoint, its price, and status, read straight from the registry.
                  </p>
                </CardBody>
              </Card>
            </Link>
          </div>

          <section id="quickstart" className="scroll-mt-24 border-t border-border pt-10 mt-10">
            <h2 className="font-display text-2xl font-bold tracking-tight text-foreground">Quickstart</h2>
            <ol className="mt-5 space-y-4">
              {QUICKSTART_STEPS.map((step, i) => (
                <li key={step.title} className="flex gap-3.5">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
                    {i + 1}
                  </span>
                  <div>
                    <p className="font-medium text-foreground">{step.title}</p>
                    <p className="text-sm text-muted">{step.detail}</p>
                  </div>
                </li>
              ))}
            </ol>
            <div className="mt-6">
              <TerminalWindow title="quickstart.sh">
                <div className="relative">
                  <pre className="scrollbar-thin overflow-auto p-4 font-mono text-xs leading-relaxed text-white/70">
                    {QUICKSTART_SNIPPET}
                  </pre>
                  <div className="absolute right-3 top-3">
                    <CopyButton value={QUICKSTART_SNIPPET} />
                  </div>
                </div>
              </TerminalWindow>
            </div>
          </section>

          <section id="response-shape" className="scroll-mt-24 border-t border-border pt-10 mt-10">
            <h2 className="font-display text-2xl font-bold tracking-tight text-foreground">402 response shape</h2>
            <p className="mt-2 max-w-2xl text-sm text-muted">
              Every unpaid request to a metered endpoint returns this shape. <code className="text-accent">accepts[]</code>{' '}
              lists the exact payment terms an agent must satisfy.
            </p>
            <div className="mt-5">
              <TerminalWindow title="402 Payment Required">
                <JsonViewer data={PAYMENT_REQUIREMENTS_EXAMPLE} bare />
              </TerminalWindow>
            </div>
          </section>

          <section id="endpoints" className="scroll-mt-24 border-t border-border pt-10 mt-10">
            <h2 className="font-display text-2xl font-bold tracking-tight text-foreground">Endpoints</h2>
            <p className="mt-2 max-w-2xl text-sm text-muted">
              Eight metered endpoints, all reachable via the same 402 → pay → 200 flow.
            </p>
            <Card className="mt-5">
              <CardBody>
                <Table>
                  <TableHead>
                    <TableRow>
                      <TableHeaderCell>Method</TableHeaderCell>
                      <TableHeaderCell>Route</TableHeaderCell>
                      <TableHeaderCell>Description</TableHeaderCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {ENDPOINTS.map((ep) => (
                      <TableRow key={ep.route}>
                        <TableCell>
                          <Badge tone={ep.method === 'GET' ? 'info' : 'accent'}>{ep.method}</Badge>
                        </TableCell>
                        <TableCell className="font-mono text-xs text-accent">{ep.route}</TableCell>
                        <TableCell className="text-muted">{ep.desc}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardBody>
            </Card>
          </section>

          <section id="rate-limits" className="scroll-mt-24 border-t border-border pt-10 mt-10">
            <h2 className="font-display text-2xl font-bold tracking-tight text-foreground">Rate limits &amp; budgets</h2>
            <div className="mt-5 space-y-3">
              <div className="flex items-center justify-between rounded-lg border border-border bg-surface px-4 py-3">
                <span className="text-sm text-muted">Anonymous (by IP)</span>
                <Badge tone="default">30 req/min</Badge>
              </div>
              <div className="flex items-center justify-between rounded-lg border border-border bg-surface px-4 py-3">
                <span className="text-sm text-muted">Wallet-verified (≥1 settled payment)</span>
                <Badge tone="success">300 req/min</Badge>
              </div>
              <div className="flex items-center justify-between rounded-lg border border-border bg-surface px-4 py-3">
                <span className="text-sm text-muted">Daily spend cap per wallet (default)</span>
                <Badge tone="info">$50 / day</Badge>
              </div>
            </div>
          </section>

          <section id="security" className="scroll-mt-24 border-t border-border pt-10 mt-10 pb-4">
            <h2 className="flex items-center gap-2 font-display text-2xl font-bold tracking-tight text-foreground">
              <LockKeyhole className="h-5 w-5 text-primary" />
              Security model
            </h2>
            <div className="mt-5 space-y-3 text-sm leading-relaxed text-muted">
              <p>
                <strong className="font-medium text-foreground">Credentials never leave the backend.</strong> The
                browser only ever talks to AgentMarket&apos;s API — upstream provider keys are never exposed.
              </p>
              <p>
                <strong className="font-medium text-foreground">Idempotent by design.</strong> Every payment
                reference is unique: a retried or replayed X-PAYMENT returns the original response instead of
                double-charging.
              </p>
              <p>
                <strong className="font-medium text-foreground">Structured errors, always.</strong> Every error
                response is <code className="text-accent">{'{ error: { code, message, requestId } }'}</code> —
                never a raw stack trace.
              </p>
            </div>
          </section>
        </div>

        {/* Right TOC */}
        <aside className="hidden lg:block">
          <nav className="sticky top-24 space-y-2">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-2">On this page</p>
            {TOC.map((item) => (
              <a
                key={item.id}
                href={`#${item.id}`}
                className="block text-sm text-muted transition-colors hover:text-foreground"
              >
                {item.label}
              </a>
            ))}
          </nav>
        </aside>
      </div>
    </div>
  );
}
