'use client';

import { ApiKeyReveal } from '@/components/provider/api-key-reveal';
import { Badge } from '@/components/ui/badge';
import { AnimatedCounter } from '@/components/ui/animated-counter';
import { Button } from '@/components/ui/button';
import { Card, CardBody, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeaderCell, TableRow } from '@/components/ui/table';
import {
  errorMessage,
  getProviderAnalytics,
  getProviderMe,
  getProviderRevenue,
  listListings,
  registerProvider,
  rotateProviderApiKey,
  verifyProvider,
} from '@/lib/provider-api';
import { useProviderSession } from '@/lib/provider-context';
import { listingStatusBadge, providerStatusBadge, verificationTierBadge } from '@/lib/provider-status';
import type { AnalyticsRange, AnalyticsSummaryView, ApiListingView, ProviderAccountView, RevenueSummaryView } from '@agentmarket/shared-types';
import { AnimatePresence, motion } from 'framer-motion';
import { Activity, DollarSign, KeyRound, LogOut, Plus, RefreshCw, ShieldCheck, Store } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useState } from 'react';

function ProviderAuthGate() {
  const { setSession } = useProviderSession();
  const [tab, setTab] = useState<'register' | 'sign-in'>('register');

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [walletAddress, setWalletAddress] = useState('');
  const [registering, setRegistering] = useState(false);
  const [registerError, setRegisterError] = useState<string | null>(null);
  const [registered, setRegistered] = useState<{ providerId: string; apiKey: string } | null>(null);

  const [pastedKey, setPastedKey] = useState('');
  const [signingIn, setSigningIn] = useState(false);
  const [signInError, setSignInError] = useState<string | null>(null);

  async function handleRegister(): Promise<void> {
    setRegistering(true);
    setRegisterError(null);
    const res = await registerProvider({ name, email, walletAddress });
    setRegistering(false);
    if (res.status === 201) {
      setRegistered({ providerId: res.body.providerId, apiKey: res.body.apiKey });
    } else {
      setRegisterError(errorMessage(res.body, 'Registration failed — check your details and try again.'));
    }
  }

  async function handleSignIn(): Promise<void> {
    setSigningIn(true);
    setSignInError(null);
    const res = await getProviderMe(pastedKey.trim());
    setSigningIn(false);
    if (res.status === 200) {
      setSession({ providerId: res.body.id, apiKey: pastedKey.trim() });
    } else {
      setSignInError('That API key was not recognized. Double-check it and try again.');
    }
  }

  if (registered) {
    return (
      <div className="mx-auto max-w-md space-y-5">
        <div>
          <h2 className="font-display text-xl font-bold tracking-tight text-foreground">You&apos;re registered</h2>
          <p className="mt-1 text-sm text-muted">One more thing before you lose this screen.</p>
        </div>
        <ApiKeyReveal apiKey={registered.apiKey} />
        <Button
          className="w-full"
          variant="gradient"
          onClick={() => setSession({ providerId: registered.providerId, apiKey: registered.apiKey })}
        >
          Continue to dashboard
        </Button>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-md">
      <div className="mb-6 inline-flex rounded-lg border border-border bg-surface p-1">
        <button
          type="button"
          onClick={() => setTab('register')}
          className={`rounded-md px-3.5 py-1.5 text-sm font-medium transition-colors ${tab === 'register' ? 'bg-surface-hover text-foreground' : 'text-muted hover:text-foreground'}`}
        >
          Register
        </button>
        <button
          type="button"
          onClick={() => setTab('sign-in')}
          className={`rounded-md px-3.5 py-1.5 text-sm font-medium transition-colors ${tab === 'sign-in' ? 'bg-surface-hover text-foreground' : 'text-muted hover:text-foreground'}`}
        >
          Sign in with API key
        </button>
      </div>

      {tab === 'register' ? (
        <Card>
          <CardBody className="space-y-4">
            <Input label="Organization or your name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Ledgerwatch Labs" />
            <Input label="Email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="devrel@ledgerwatch.com" />
            <Input
              label="Algorand wallet address"
              hint="payouts settle here by default"
              value={walletAddress}
              onChange={(e) => setWalletAddress(e.target.value)}
              placeholder="58-character Algorand address"
              className="font-mono text-xs"
            />
            {registerError && <p className="text-sm text-danger">{registerError}</p>}
            <Button
              className="w-full"
              variant="gradient"
              loading={registering}
              disabled={!name || !email || !walletAddress}
              onClick={() => void handleRegister()}
            >
              Create provider account
            </Button>
          </CardBody>
        </Card>
      ) : (
        <Card>
          <CardBody className="space-y-4">
            <Input
              label="API key"
              icon={<KeyRound className="h-4 w-4" />}
              value={pastedKey}
              onChange={(e) => setPastedKey(e.target.value)}
              placeholder="amk_…"
              className="font-mono text-xs"
            />
            {signInError && <p className="text-sm text-danger">{signInError}</p>}
            <Button className="w-full" loading={signingIn} disabled={!pastedKey} onClick={() => void handleSignIn()}>
              Sign in
            </Button>
          </CardBody>
        </Card>
      )}
    </div>
  );
}

function RotateKeyControl({ apiKey, onRotated }: { apiKey: string; onRotated: (newKey: string) => void }) {
  const [confirming, setConfirming] = useState(false);
  const [rotating, setRotating] = useState(false);
  const [newKey, setNewKey] = useState<string | null>(null);

  async function handleRotate(): Promise<void> {
    setRotating(true);
    const res = await rotateProviderApiKey(apiKey);
    setRotating(false);
    setConfirming(false);
    if (res.status === 200) setNewKey(res.body.apiKey);
  }

  if (newKey) {
    return (
      <div className="col-span-full">
        <ApiKeyReveal apiKey={newKey} />
        <div className="mt-3 flex justify-end">
          <Button size="sm" onClick={() => onRotated(newKey)}>
            Done — use this key going forward
          </Button>
        </div>
      </div>
    );
  }

  if (confirming) {
    return (
      <div className="flex items-center gap-2">
        <span className="text-xs text-muted">Old key stops working immediately.</span>
        <Button size="sm" variant="danger" loading={rotating} onClick={() => void handleRotate()}>
          Confirm rotate
        </Button>
        <Button size="sm" variant="ghost" onClick={() => setConfirming(false)}>
          Cancel
        </Button>
      </div>
    );
  }

  return (
    <Button size="sm" variant="secondary" icon={<RefreshCw className="h-3.5 w-3.5" />} onClick={() => setConfirming(true)}>
      Rotate API key
    </Button>
  );
}

function RevenueSection({ apiKey }: { apiKey: string }) {
  const [revenue, setRevenue] = useState<RevenueSummaryView | null>(null);

  useEffect(() => {
    let cancelled = false;
    void getProviderRevenue(apiKey).then((res) => {
      if (!cancelled && res.status === 200) setRevenue(res.body);
    });
    return () => {
      cancelled = true;
    };
  }, [apiKey]);

  return (
    <Card>
      <CardHeader className="flex items-center gap-2">
        <DollarSign className="h-4 w-4 text-primary" />
        <CardTitle>Revenue</CardTitle>
      </CardHeader>
      <CardBody>
        {!revenue ? (
          <div className="h-24 animate-pulse rounded-xl bg-surface-hover" />
        ) : (
          <div className="space-y-5">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="rounded-xl border border-border bg-surface-hover px-4 py-3">
                <div className="text-xs font-medium uppercase tracking-wide text-muted-2">Total earned</div>
                <div className="mt-1 font-display text-2xl font-bold tracking-tight text-foreground">
                  <AnimatedCounter value={revenue.totalEarnedUsd} decimals={2} prefix="$" />
                </div>
              </div>
              <div className="rounded-xl border border-border bg-surface-hover px-4 py-3">
                <div className="text-xs font-medium uppercase tracking-wide text-muted-2">This month</div>
                <div className="mt-1 font-display text-2xl font-bold tracking-tight text-foreground">
                  <AnimatedCounter value={revenue.thisMonthUsd} decimals={2} prefix="$" />
                </div>
              </div>
            </div>

            {revenue.listings.length === 0 ? (
              <div className="py-6 text-center">
                <p className="font-medium text-foreground">No revenue yet</p>
                <p className="mx-auto mt-1 max-w-md text-sm text-muted">
                  Third-party listings aren&apos;t proxied through a live gateway yet, so no real payment has
                  settled against one. These numbers are accurate — not placeholders — and will update the moment
                  traffic starts flowing.
                </p>
              </div>
            ) : (
              <div>
                <h4 className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-2">By listing</h4>
                <Table>
                  <TableHead>
                    <TableRow>
                      <TableHeaderCell>Listing</TableHeaderCell>
                      <TableHeaderCell>Payments</TableHeaderCell>
                      <TableHeaderCell>Earned</TableHeaderCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {revenue.listings.map((listing) => (
                      <TableRow key={listing.listingId}>
                        <TableCell>
                          <div className="font-medium text-foreground">{listing.name}</div>
                          <div className="font-mono text-xs text-muted-2">{listing.slug}</div>
                        </TableCell>
                        <TableCell className="text-muted">{listing.paymentCount}</TableCell>
                        <TableCell className="text-foreground">${listing.totalUsd.toFixed(2)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}

            {revenue.recentPayouts.length > 0 && (
              <div>
                <h4 className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-2">Recent payouts</h4>
                <Table>
                  <TableHead>
                    <TableRow>
                      <TableHeaderCell>Period</TableHeaderCell>
                      <TableHeaderCell>Amount</TableHeaderCell>
                      <TableHeaderCell>Status</TableHeaderCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {revenue.recentPayouts.map((payout) => (
                      <TableRow key={payout.id}>
                        <TableCell className="text-muted">
                          {new Date(payout.periodStart).toLocaleDateString()} –{' '}
                          {new Date(payout.periodEnd).toLocaleDateString()}
                        </TableCell>
                        <TableCell className="text-foreground">${payout.amountUsd.toFixed(2)}</TableCell>
                        <TableCell>
                          <Badge tone={payout.status === 'paid' ? 'success' : 'warning'} dot>
                            {payout.status === 'paid' ? 'Paid' : 'Pending'}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </div>
        )}
      </CardBody>
    </Card>
  );
}

const RANGE_LABELS: Record<AnalyticsRange, string> = { '24h': 'Last 24 hours', '7d': 'Last 7 days', '30d': 'Last 30 days' };

function AnalyticsSection({ apiKey }: { apiKey: string }) {
  const [range, setRange] = useState<AnalyticsRange>('24h');
  const [analytics, setAnalytics] = useState<AnalyticsSummaryView | null>(null);

  useEffect(() => {
    let cancelled = false;
    setAnalytics(null);
    void getProviderAnalytics(apiKey, range).then((res) => {
      if (!cancelled && res.status === 200) setAnalytics(res.body);
    });
    return () => {
      cancelled = true;
    };
  }, [apiKey, range]);

  return (
    <Card>
      <CardHeader className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Activity className="h-4 w-4 text-primary" />
          <CardTitle>Analytics</CardTitle>
        </div>
        <div className="w-40">
          <Select value={range} onChange={(e) => setRange(e.target.value as AnalyticsRange)}>
            {(Object.keys(RANGE_LABELS) as AnalyticsRange[]).map((r) => (
              <option key={r} value={r}>
                {RANGE_LABELS[r]}
              </option>
            ))}
          </Select>
        </div>
      </CardHeader>
      <CardBody>
        {!analytics ? (
          <div className="h-24 animate-pulse rounded-xl bg-surface-hover" />
        ) : analytics.totals.requestCount === 0 ? (
          <div className="py-6 text-center">
            <p className="font-medium text-foreground">No traffic yet</p>
            <p className="mx-auto mt-1 max-w-md text-sm text-muted">
              Third-party listings aren&apos;t proxied through a live gateway yet, so there&apos;s no call-level data
              to show. These numbers are accurate — not placeholders — and will populate the moment traffic starts
              flowing.
            </p>
          </div>
        ) : (
          <div className="space-y-5">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              <StatTile label="Requests" value={analytics.totals.requestCount} />
              <StatTile label="Avg latency" value={analytics.totals.avgLatencyMs} suffix="ms" />
              <StatTile label="p95 latency" value={analytics.totals.p95LatencyMs} suffix="ms" />
              <StatTile label="Error rate" value={analytics.totals.errorRate * 100} decimals={1} suffix="%" />
              <StatTile label="Cache hit rate" value={analytics.totals.cacheHitRate * 100} decimals={1} suffix="%" />
              <StatTile
                label="Payment success"
                value={analytics.totals.paymentAttemptCount === 0 ? undefined : analytics.totals.paymentSuccessRate * 100}
                decimals={1}
                suffix={analytics.totals.paymentAttemptCount === 0 ? undefined : '%'}
                fallback={analytics.totals.paymentAttemptCount === 0 ? 'No attempts yet' : undefined}
              />
            </div>

            <div>
              <h4 className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-2">
                Over time ({analytics.bucket === 'hour' ? 'hourly' : 'daily'})
              </h4>
              <Table>
                <TableHead>
                  <TableRow>
                    <TableHeaderCell>When</TableHeaderCell>
                    <TableHeaderCell>Requests</TableHeaderCell>
                    <TableHeaderCell>Avg latency</TableHeaderCell>
                    <TableHeaderCell>p95</TableHeaderCell>
                    <TableHeaderCell>Errors</TableHeaderCell>
                    <TableHeaderCell>Cache hit</TableHeaderCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {analytics.points.map((point) => (
                    <TableRow key={point.timestamp}>
                      <TableCell className="text-muted">
                        {analytics.bucket === 'hour'
                          ? new Date(point.timestamp).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric' })
                          : new Date(point.timestamp).toLocaleDateString()}
                      </TableCell>
                      <TableCell className="text-foreground">{point.requestCount}</TableCell>
                      <TableCell className="text-muted">{point.avgLatencyMs}ms</TableCell>
                      <TableCell className="text-muted">{point.p95LatencyMs}ms</TableCell>
                      <TableCell className="text-muted">{(point.errorRate * 100).toFixed(1)}%</TableCell>
                      <TableCell className="text-muted">{(point.cacheHitRate * 100).toFixed(1)}%</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            {analytics.topListings.length > 1 && (
              <div>
                <h4 className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-2">Top listings</h4>
                <Table>
                  <TableHead>
                    <TableRow>
                      <TableHeaderCell>Listing</TableHeaderCell>
                      <TableHeaderCell>Requests</TableHeaderCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {analytics.topListings.map((listing) => (
                      <TableRow key={listing.listingId}>
                        <TableCell>
                          <div className="font-medium text-foreground">{listing.name}</div>
                          <div className="font-mono text-xs text-muted-2">{listing.slug}</div>
                        </TableCell>
                        <TableCell className="text-muted">{listing.requestCount}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}

            {analytics.topCustomers.length > 0 && (
              <div>
                <h4 className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-2">Top customers</h4>
                <Table>
                  <TableHead>
                    <TableRow>
                      <TableHeaderCell>Wallet</TableHeaderCell>
                      <TableHeaderCell>Requests</TableHeaderCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {analytics.topCustomers.map((customer) => (
                      <TableRow key={customer.walletAddress}>
                        <TableCell className="font-mono text-xs text-foreground">
                          {customer.walletAddress.slice(0, 8)}…{customer.walletAddress.slice(-6)}
                        </TableCell>
                        <TableCell className="text-muted">{customer.requestCount}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </div>
        )}
      </CardBody>
    </Card>
  );
}

function StatTile({
  label,
  value,
  decimals = 0,
  suffix,
  fallback,
}: {
  label: string;
  value: number | undefined;
  decimals?: number;
  suffix?: string;
  fallback?: string;
}) {
  return (
    <div className="rounded-xl border border-border bg-surface-hover px-4 py-3">
      <div className="text-xs font-medium uppercase tracking-wide text-muted-2">{label}</div>
      <div className="mt-1 font-display text-xl font-bold tracking-tight text-foreground">
        {value === undefined ? <span className="text-sm font-medium text-muted">{fallback}</span> : <AnimatedCounter value={value} decimals={decimals} suffix={suffix} />}
      </div>
    </div>
  );
}

type DashboardTab = 'listings' | 'revenue' | 'analytics';
const DASHBOARD_TABS: Array<{ key: DashboardTab; label: string }> = [
  { key: 'listings', label: 'Listings' },
  { key: 'revenue', label: 'Revenue' },
  { key: 'analytics', label: 'Analytics' },
];

function ProviderDashboard({ apiKey }: { apiKey: string }) {
  const { clearSession, setSession } = useProviderSession();
  const [account, setAccount] = useState<ProviderAccountView | null>(null);
  const [listings, setListings] = useState<ApiListingView[] | null>(null);
  const [verifying, setVerifying] = useState(false);
  const [verifyError, setVerifyError] = useState<string | null>(null);
  const [tab, setTab] = useState<DashboardTab>('listings');

  async function refresh(key: string): Promise<void> {
    const [me, ls] = await Promise.all([getProviderMe(key), listListings(key)]);
    if (me.status === 200) setAccount(me.body);
    if (ls.status === 200) setListings(ls.body.listings);
  }

  useEffect(() => {
    void refresh(apiKey);
  }, [apiKey]);

  async function handleVerify(): Promise<void> {
    setVerifying(true);
    setVerifyError(null);
    const res = await verifyProvider(apiKey);
    setVerifying(false);
    if (res.status === 200) {
      setAccount(res.body);
    } else {
      setVerifyError(errorMessage(res.body, 'Verification failed.'));
    }
  }

  if (!account || !listings) {
    return (
      <div className="space-y-4">
        <div className="h-24 animate-pulse rounded-2xl border border-border bg-surface" />
        <div className="h-64 animate-pulse rounded-2xl border border-border bg-surface" />
      </div>
    );
  }

  const status = providerStatusBadge(account.status);
  const tier = verificationTierBadge(account.verificationTier);

  return (
    <div className="space-y-6">
      <Card>
        <CardBody className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2.5">
              <h1 className="font-display text-xl font-bold tracking-tight text-foreground">{account.name}</h1>
              <Badge tone={status.tone} dot>
                {status.label}
              </Badge>
              {tier && <Badge tone={tier.tone}>{tier.label}</Badge>}
              <span className="text-xs text-muted-2">Trust score {account.trustScore}/100</span>
            </div>
            <p className="mt-0.5 text-sm text-muted">{account.email}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {account.status === 'pending' && (
              <Button size="sm" icon={<ShieldCheck className="h-3.5 w-3.5" />} loading={verifying} onClick={() => void handleVerify()}>
                Verify account
              </Button>
            )}
            <RotateKeyControl apiKey={apiKey} onRotated={(newKey) => setSession({ providerId: account.id, apiKey: newKey })} />
            <Button size="sm" variant="ghost" icon={<LogOut className="h-3.5 w-3.5" />} onClick={clearSession}>
              Sign out
            </Button>
          </div>
        </CardBody>
        {verifyError && (
          <div className="border-t border-border px-5 py-3 text-sm text-danger">{verifyError}</div>
        )}
      </Card>

      <div className="inline-flex rounded-lg border border-border bg-surface p-1">
        {DASHBOARD_TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            className={`rounded-md px-3.5 py-1.5 text-sm font-medium transition-colors ${tab === t.key ? 'bg-surface-hover text-foreground' : 'text-muted hover:text-foreground'}`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'listings' && (
      <Card>
        <CardHeader className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Store className="h-4 w-4 text-primary" />
            <CardTitle>Your listings</CardTitle>
          </div>
          <Link href="/provider/listings/new">
            <Button size="sm" icon={<Plus className="h-3.5 w-3.5" />}>
              New listing
            </Button>
          </Link>
        </CardHeader>
        <CardBody>
          {listings.length === 0 ? (
            <div className="py-10 text-center">
              <p className="font-medium text-foreground">You haven&apos;t published anything yet</p>
              <p className="mx-auto mt-1 max-w-sm text-sm text-muted">
                Upload an API, set a price and payout wallet, then publish — it shows up in the marketplace right away.
              </p>
              <Link href="/provider/listings/new">
                <Button className="mt-4" size="sm" icon={<Plus className="h-3.5 w-3.5" />}>
                  Create your first listing
                </Button>
              </Link>
            </div>
          ) : (
            <Table>
              <TableHead>
                <TableRow>
                  <TableHeaderCell>Listing</TableHeaderCell>
                  <TableHeaderCell>Category</TableHeaderCell>
                  <TableHeaderCell>Price</TableHeaderCell>
                  <TableHeaderCell>Status</TableHeaderCell>
                  <TableHeaderCell />
                </TableRow>
              </TableHead>
              <TableBody>
                {listings.map((listing) => {
                  const badge = listingStatusBadge(listing.status);
                  return (
                    <TableRow key={listing.id}>
                      <TableCell>
                        <div className="font-medium text-foreground">{listing.name}</div>
                        <div className="font-mono text-xs text-muted-2">{listing.slug}</div>
                      </TableCell>
                      <TableCell className="text-muted">{listing.category}</TableCell>
                      <TableCell className="text-muted">{listing.priceUsd != null ? `$${listing.priceUsd.toFixed(2)}` : '—'}</TableCell>
                      <TableCell>
                        <Badge tone={badge.tone} dot>
                          {badge.label}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Link href={`/provider/listings/${listing.id}`} className="text-sm font-medium text-primary hover:text-primary-hover">
                          Manage
                        </Link>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardBody>
      </Card>
      )}

      {tab === 'revenue' && <RevenueSection apiKey={apiKey} />}
      {tab === 'analytics' && <AnalyticsSection apiKey={apiKey} />}
    </div>
  );
}

export default function ProviderPage() {
  const { session, hydrated } = useProviderSession();

  return (
    <div className="mx-auto max-w-5xl px-6 py-12">
      <div className="mb-8">
        <div className="flex items-center gap-2.5">
          <Store className="h-6 w-6 text-primary" />
          <h1 className="font-display text-4xl font-bold tracking-tight text-foreground">Provider dashboard</h1>
        </div>
        <p className="mt-2 max-w-2xl text-muted">
          Register, publish, price and manage the APIs you bring to AgentMarket — the same control plane the docs
          describe, with a UI on top of it.
        </p>
      </div>

      {!hydrated ? (
        <div className="h-40 animate-pulse rounded-2xl border border-border bg-surface" />
      ) : (
        <AnimatePresence mode="wait">
          <motion.div key={session ? 'dashboard' : 'auth'} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25 }}>
            {session ? <ProviderDashboard apiKey={session.apiKey} /> : <ProviderAuthGate />}
          </motion.div>
        </AnimatePresence>
      )}
    </div>
  );
}
