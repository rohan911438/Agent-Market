'use client';

import { AnimatedCounter } from '@/components/ui/animated-counter';
import { Badge } from '@/components/ui/badge';
import { Card, CardBody } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeaderCell, TableRow } from '@/components/ui/table';
import { callApi } from '@/lib/api-client';
import { Calculator, CreditCard, Key, Receipt, ShieldAlert } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';

interface MarketplaceApi {
  id: string;
  name: string;
  priceUsd: number;
  endpoint: string;
  status: 'live' | 'beta';
}

const FEATURES = [
  { title: 'No API keys', detail: 'Wallet signature replaces the credential entirely — nothing to leak, rotate, or revoke.', icon: Key },
  { title: 'No subscriptions', detail: 'Every call is its own on-chain micropayment. Stop calling, stop paying — instantly.', icon: Receipt },
  { title: 'Daily spend caps', detail: 'Per-wallet budget limits protect against runaway or misbehaving agents.', icon: ShieldAlert },
];

export default function PricingPage() {
  const [apis, setApis] = useState<MarketplaceApi[]>([]);
  const [loading, setLoading] = useState(true);
  const [calcEndpoint, setCalcEndpoint] = useState(0);
  const [requestsPerDay, setRequestsPerDay] = useState(1000);

  useEffect(() => {
    void callApi<{ apis: MarketplaceApi[] }>('/v1/marketplace').then((res) => {
      if (res.status === 200) setApis(res.body.apis);
      setLoading(false);
    });
  }, []);

  const selected = apis[calcEndpoint];
  const dailyCost = useMemo(() => (selected ? selected.priceUsd * requestsPerDay : 0), [selected, requestsPerDay]);

  return (
    <div className="mx-auto max-w-5xl px-6 py-12">
      <Badge tone="payment" icon={<CreditCard className="h-3 w-3" />}>
        Pricing
      </Badge>
      <h1 className="mt-4 font-display text-4xl font-bold tracking-tight text-foreground sm:text-5xl">
        Pay only for what your agent uses.
      </h1>
      <p className="mt-3 max-w-2xl text-lg leading-relaxed text-muted">
        No subscriptions, no seats, no monthly minimums — an agent pays exactly for what it calls, settled
        on Algorand via x402.
      </p>

      <Card className="mt-10">
        <CardBody>
          <div className="mb-6 flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-primary">
              <Calculator className="h-4 w-4" />
            </span>
            <h2 className="font-display text-lg font-bold tracking-tight text-foreground">Cost estimator</h2>
          </div>
          {loading ? (
            <div className="grid gap-4 sm:grid-cols-2">
              <Skeleton className="h-11" />
              <Skeleton className="h-11" />
            </div>
          ) : (
            <div className="grid gap-6 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
              <Select label="Endpoint" value={calcEndpoint} onChange={(e) => setCalcEndpoint(Number(e.target.value))}>
                {apis.map((api, i) => (
                  <option key={api.id} value={i}>
                    {api.name} — ${api.priceUsd.toFixed(2)}
                  </option>
                ))}
              </Select>
              <Input
                label="Requests / day"
                type="number"
                min={0}
                value={requestsPerDay}
                onChange={(e) => setRequestsPerDay(Math.max(0, Number(e.target.value)))}
              />
              <div className="rounded-xl border border-primary/30 bg-primary/10 px-5 py-3 text-center sm:text-left">
                <p className="text-xs font-medium uppercase tracking-wide text-muted">Estimated cost</p>
                <p className="font-display text-2xl font-bold text-foreground">
                  $<AnimatedCounter value={dailyCost} decimals={2} />
                  <span className="text-sm font-normal text-muted"> / day</span>
                </p>
                <p className="text-xs text-muted-2">
                  ≈ $<AnimatedCounter value={dailyCost * 30} decimals={2} /> / month
                </p>
              </div>
            </div>
          )}
        </CardBody>
      </Card>

      <div className="mt-14 border-t border-border pt-10">
        <h2 className="font-display text-2xl font-bold tracking-tight text-foreground">All endpoints</h2>
        <p className="mt-2 max-w-xl text-sm text-muted">
          Live, per-request pricing — read straight from the same registry the API serves requests from.
        </p>
        <Card className="mt-5">
          <CardBody>
            <Table>
              <TableHead>
                <TableRow>
                  <TableHeaderCell>Endpoint</TableHeaderCell>
                  <TableHeaderCell>Price / request</TableHeaderCell>
                  <TableHeaderCell>Status</TableHeaderCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {loading &&
                  Array.from({ length: 5 }).map((_, i) => (
                    <TableRow key={i}>
                      <TableCell colSpan={3}>
                        <Skeleton className="h-5 w-full max-w-sm" />
                      </TableCell>
                    </TableRow>
                  ))}
                {!loading &&
                  apis.map((api) => (
                    <TableRow key={api.id}>
                      <TableCell>
                        <div className="text-foreground">{api.name}</div>
                        <div className="font-mono text-xs text-muted-2">{api.endpoint}</div>
                      </TableCell>
                      <TableCell className="font-semibold text-accent">${api.priceUsd.toFixed(2)}</TableCell>
                      <TableCell>
                        <Badge tone={api.status === 'live' ? 'success' : 'warning'} dot>
                          {api.status}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
              </TableBody>
            </Table>
          </CardBody>
        </Card>
      </div>

      <div className="mt-14 border-t border-border pt-10">
        <h2 className="font-display text-2xl font-bold tracking-tight text-foreground">Why pay-per-request</h2>
        <div className="mt-5 grid gap-4 sm:grid-cols-3">
          {FEATURES.map((f) => (
            <Card key={f.title}>
              <CardBody>
                <span className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/10 text-primary">
                  <f.icon className="h-4 w-4" />
                </span>
                <h3 className="mt-3 font-semibold text-foreground">{f.title}</h3>
                <p className="mt-1 text-sm leading-relaxed text-muted">{f.detail}</p>
              </CardBody>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
}
