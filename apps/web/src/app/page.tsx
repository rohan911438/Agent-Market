'use client';

import { AnimatedCounter } from '@/components/ui/animated-counter';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardBody } from '@/components/ui/card';
import { JsonViewer } from '@/components/ui/json-viewer';
import { Marquee, type MarqueeItem } from '@/components/ui/marquee';
import { TerminalWindow } from '@/components/ui/terminal-window';
import { motion } from 'framer-motion';
import Image from 'next/image';
import {
  Activity,
  ArrowRight,
  BarChart3,
  Brain,
  FileJson,
  Flame,
  Gauge,
  Grid2x2,
  LineChart,
  PieChart,
  Repeat,
  Rocket,
  ScrollText,
  ShieldAlert,
  ShieldCheck,
  Wallet,
  Zap,
} from 'lucide-react';
import Link from 'next/link';
import type { ComponentType } from 'react';

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

const FLOW_STEPS: { title: string; detail: string; icon: ComponentType<{ className?: string }> }[] = [
  { title: 'Call premium endpoint', detail: 'Agent sends a normal HTTPS request — no API key.', icon: Zap },
  { title: '402 Payment Required', detail: 'Server responds with exact price + payment terms.', icon: ScrollText },
  { title: 'Wallet pays automatically', detail: 'Agent signs an x402 payment and retries with X-PAYMENT.', icon: Wallet },
  { title: 'Verified & settled', detail: 'Facilitator verifies + settles on Algorand.', icon: ShieldCheck },
  { title: 'Structured JSON', detail: 'Actionable intelligence returned — for humans or agents.', icon: FileJson },
];

const ENDPOINTS: { path: string; label: string; price: string; status: string; icon: ComponentType<{ className?: string }> }[] = [
  { path: '/v1/analyze', label: 'Analyze', price: '$0.05', status: 'live', icon: BarChart3 },
  { path: '/v1/market-summary', label: 'Market Summary', price: '$0.02', status: 'live', icon: LineChart },
  { path: '/v1/sentiment', label: 'Sentiment', price: '$0.02', status: 'live', icon: Gauge },
  { path: '/v1/risk-analysis', label: 'Risk Analysis', price: '$0.03', status: 'live', icon: ShieldAlert },
  { path: '/v1/technical-summary', label: 'Technical Summary', price: '$0.03', status: 'live', icon: Activity },
  { path: '/v1/trending-assets', label: 'Trending Assets', price: '$0.02', status: 'live', icon: Flame },
  { path: '/v1/portfolio-health', label: 'Portfolio Health', price: '$0.04', status: 'live', icon: PieChart },
  { path: '/v1/execution-readiness', label: 'Execution Readiness', price: '$0.03', status: 'live', icon: Rocket },
];

const TICKER_ITEMS: MarqueeItem[] = ENDPOINTS.map((api) => ({
  label: api.path,
  value: `${api.price} / call`,
  detail: api.status,
}));

const fadeUp = {
  hidden: { opacity: 0, y: 16 },
  show: { opacity: 1, y: 0, transition: { duration: 0.5, ease: 'easeOut' as const } },
};

const stagger = {
  hidden: {},
  show: { transition: { staggerChildren: 0.08 } },
};

export default function LandingPage() {
  return (
    <div>
      {/* Hero — cinematic framed card */}
      <section className="px-4 pt-6 sm:px-6">
        <div className="relative mx-auto max-w-7xl overflow-hidden rounded-3xl border border-border bg-[#050507] shadow-card-hover">
          <div className="pointer-events-none absolute inset-0 overflow-hidden">
            <div
              className="absolute inset-x-0 bottom-0 h-[70%]"
              style={{
                maskImage: 'linear-gradient(to bottom, transparent, black 35%)',
                WebkitMaskImage: 'linear-gradient(to bottom, transparent, black 35%)',
              }}
            >
              <Image
                src="/images/hero-skyline.png"
                alt="Manhattan skyline at dusk"
                fill
                priority
                sizes="100vw"
                className="object-cover object-bottom opacity-80 saturate-[0.8]"
              />
            </div>
            <div className="animate-drift absolute -left-32 -top-32 h-[30rem] w-[30rem] rounded-full bg-primary/35 blur-[110px]" />
            <div
              className="animate-drift absolute -right-24 top-1/4 h-[26rem] w-[26rem] rounded-full bg-payment/30 blur-[110px]"
              style={{ animationDelay: '-6s' }}
            />
            <div
              className="animate-drift absolute bottom-0 left-1/3 h-[24rem] w-[24rem] rounded-full bg-accent/20 blur-[110px]"
              style={{ animationDelay: '-12s' }}
            />
            <div className="bg-grid absolute inset-0 opacity-[0.08]" />
            <div className="absolute inset-0 bg-gradient-to-b from-[#050507] via-[#050507]/70 to-[#050507]/90" />
            <div className="absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-[#050507] to-transparent" />
          </div>

          <div className="relative flex flex-col items-center gap-7 px-6 pb-28 pt-20 text-center sm:pb-32 sm:pt-28">
            <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}>
              <Badge tone="ai" icon={<Zap className="h-3 w-3" />} className="border-white/15 bg-white/5 text-white">
                x402-native · Algorand · AI Agent Commerce
              </Badge>
            </motion.div>

            <motion.h1
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.05 }}
              className="max-w-4xl font-display text-5xl font-bold leading-[1.03] tracking-tight text-white sm:text-7xl lg:text-8xl"
            >
              Trade intelligence.
              <br />
              <span className="bg-[linear-gradient(120deg,#a5b4fc,#c4b5fd,#67e8f9)] bg-clip-text text-transparent">
                Without limits.
              </span>
            </motion.h1>

            <motion.p
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.55, delay: 0.15 }}
              className="max-w-2xl text-balance text-lg leading-relaxed text-white/60"
            >
              AgentMarket is the marketplace where AI agents pay per request for premium financial
              intelligence — no subscriptions, no API keys, no monthly billing. Every call settles on-chain,
              instantly, via x402 on Algorand.
            </motion.p>

            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.55, delay: 0.22 }}
              className="flex flex-col gap-3 sm:flex-row"
            >
              <Link href="/explorer">
                <Button variant="gradient" size="lg" icon={<Zap className="h-4 w-4" />}>
                  Launch API Explorer
                </Button>
              </Link>
              <Link href="/docs">
                <Button
                  variant="secondary"
                  size="lg"
                  icon={<ArrowRight className="h-4 w-4" />}
                  className="border border-white/15 bg-white/10 text-white hover:bg-white/15"
                >
                  Read the docs
                </Button>
              </Link>
            </motion.div>

            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.6, delay: 0.35 }}
              className="mt-4 flex flex-wrap items-center justify-center gap-x-10 gap-y-4 text-sm"
            >
              <div className="text-center">
                <div className="font-display text-3xl font-bold text-white">
                  <AnimatedCounter value={ENDPOINTS.length} />
                </div>
                <div className="text-xs text-white/40">Live endpoints</div>
              </div>
              <div className="h-8 w-px bg-white/15" />
              <div className="text-center">
                <div className="font-display text-3xl font-bold text-white">x402</div>
                <div className="text-xs text-white/40">Payment protocol</div>
              </div>
              <div className="h-8 w-px bg-white/15" />
              <div className="text-center">
                <div className="font-display text-3xl font-bold text-white">Algorand</div>
                <div className="text-xs text-white/40">Settlement network</div>
              </div>
              <div className="h-8 w-px bg-white/15" />
              <div className="text-center">
                <div className="font-display text-3xl font-bold text-white">0</div>
                <div className="text-xs text-white/40">API keys required</div>
              </div>
            </motion.div>
          </div>

          {/* Live pricing ticker */}
          <div className="glass absolute inset-x-0 bottom-0 border-t border-white/10 py-3 text-white">
            <Marquee items={TICKER_ITEMS} />
          </div>
        </div>
      </section>

      <div className="relative overflow-hidden">
        <div className="pointer-events-none absolute inset-0 -z-10">
          <div className="absolute left-1/2 top-[10%] h-[36rem] w-[36rem] -translate-x-1/2 rounded-full bg-primary/[0.06] blur-[140px]" />
          <div className="absolute right-0 top-[55%] h-[30rem] w-[30rem] rounded-full bg-payment/[0.05] blur-[140px]" />
          <div className="absolute bottom-[5%] left-0 h-[28rem] w-[28rem] rounded-full bg-accent/[0.05] blur-[140px]" />
        </div>

        <div className="mx-auto max-w-6xl px-6">
          {/* Comparison */}
          <motion.section
            initial="hidden"
            whileInView="show"
            viewport={{ once: true, margin: '-80px' }}
            variants={stagger}
            className="py-24"
          >
            <motion.div variants={fadeUp} className="mb-12 text-center">
              <Badge tone="ai" icon={<Brain className="h-3 w-3" />}>
                Structured intelligence
              </Badge>
              <h2 className="mt-4 font-display text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
                Decision intelligence, not price feeds
              </h2>
              <p className="mx-auto mt-2 max-w-xl text-muted">
                Every call returns actionable reasoning an agent can act on — purchased per request.
              </p>
            </motion.div>

            <div className="grid items-center gap-8 lg:grid-cols-[0.8fr_auto_1.4fr]">
              <motion.div variants={fadeUp}>
                <p className="mb-3 text-sm font-medium uppercase tracking-wide text-muted-2">Instead of this</p>
                <div className="flex h-full min-h-40 flex-col justify-center rounded-2xl border border-dashed border-border bg-surface/50 p-6">
                  <p className="font-mono text-sm text-muted-2 line-through decoration-danger/50">
                    BTC Price = $120,000
                  </p>
                  <p className="mt-2 text-xs text-muted-2">A number. No context, no confidence, no reasoning.</p>
                </div>
              </motion.div>

              <motion.div variants={fadeUp} className="hidden justify-center lg:flex">
                <span className="flex h-9 w-9 items-center justify-center rounded-full border border-border bg-surface text-muted">
                  <ArrowRight className="h-4 w-4" />
                </span>
              </motion.div>

              <motion.div variants={fadeUp}>
                <p className="mb-3 text-sm font-medium uppercase tracking-wide text-accent">
                  We return this — with the WHY
                </p>
                <div className="rotate-0 transition-transform duration-300 will-change-transform lg:rotate-1 lg:hover:rotate-0">
                  <TerminalWindow title="GET /v1/analyze?symbol=BTC — 200 OK">
                    <JsonViewer data={EXAMPLE_RESPONSE} bare />
                  </TerminalWindow>
                </div>
              </motion.div>
            </div>
          </motion.section>

          {/* Payment flow */}
          <motion.section
            initial="hidden"
            whileInView="show"
            viewport={{ once: true, margin: '-80px' }}
            variants={stagger}
            className="border-t border-border py-24"
          >
            <motion.div variants={fadeUp} className="mb-12 text-center">
              <Badge tone="payment" icon={<Repeat className="h-3 w-3" />}>
                Settled per request
              </Badge>
              <h2 className="mt-4 font-display text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
                How the x402 payment flow works
              </h2>
            </motion.div>

            <div className="relative grid gap-4 md:grid-cols-5">
              <div className="absolute left-0 right-0 top-9 hidden h-px bg-border md:block" />
              {FLOW_STEPS.map((step, i) => (
                <motion.div key={step.title} variants={fadeUp} className="relative">
                  <Card interactive className="h-full">
                    <CardBody>
                      <div className="relative z-10 mb-3 flex h-9 w-9 items-center justify-center rounded-full border border-primary/30 bg-background text-primary shadow-glow-primary">
                        <step.icon className="h-4 w-4" />
                      </div>
                      <p className="mb-1 text-xs font-medium text-muted-2">Step {i + 1}</p>
                      <h3 className="mb-1 font-medium text-foreground">{step.title}</h3>
                      <p className="text-sm text-muted">{step.detail}</p>
                    </CardBody>
                  </Card>
                </motion.div>
              ))}
            </div>
          </motion.section>

          {/* Endpoints */}
          <motion.section
            initial="hidden"
            whileInView="show"
            viewport={{ once: true, margin: '-80px' }}
            variants={stagger}
            className="border-t border-border py-24"
          >
            <motion.div variants={fadeUp} className="mb-12 text-center">
              <Badge tone="accent" icon={<Grid2x2 className="h-3 w-3" />}>
                One gateway, eight endpoints
              </Badge>
              <h2 className="mt-4 font-display text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
                Financial Intelligence APIs
              </h2>
              <p className="mx-auto mt-2 max-w-xl text-muted">
                Pay-per-call endpoints, priced in fractions of a cent, verified and settled on-chain.
              </p>
            </motion.div>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {ENDPOINTS.map((api) => (
                <motion.div key={api.path} variants={fadeUp}>
                  <Card interactive className="h-full">
                    <CardBody>
                      <div className="mb-3 flex items-center justify-between">
                        <span className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/10 text-primary">
                          <api.icon className="h-4 w-4" />
                        </span>
                        <span className="text-sm font-semibold text-accent">{api.price}</span>
                      </div>
                      <div className="mb-1.5 flex items-center gap-2">
                        <h3 className="font-medium text-foreground">{api.label}</h3>
                        <Badge tone={api.status === 'live' ? 'success' : 'warning'} dot />
                      </div>
                      <p className="font-mono text-xs text-muted-2">{api.path}</p>
                    </CardBody>
                  </Card>
                </motion.div>
              ))}
            </div>
          </motion.section>

          {/* Closing CTA */}
          <motion.section
            initial="hidden"
            whileInView="show"
            viewport={{ once: true, margin: '-80px' }}
            variants={fadeUp}
            className="border-t border-border py-24 text-center"
          >
            <h2 className="font-display text-4xl font-bold tracking-tight text-foreground sm:text-5xl">
              Give your agents
              <br />
              financial intelligence.
            </h2>
            <p className="mx-auto mt-3 max-w-lg text-muted">
              Connect a wallet and send your first metered request — no signup required.
            </p>
            <div className="mt-8 flex justify-center">
              <Link href="/explorer">
                <Button variant="gradient" size="lg" icon={<Zap className="h-4 w-4" />}>
                  Open the API Explorer
                </Button>
              </Link>
            </div>
          </motion.section>
        </div>
      </div>
    </div>
  );
}
