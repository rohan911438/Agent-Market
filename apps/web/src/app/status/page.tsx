'use client';

import { Badge } from '@/components/ui/badge';
import { Card, CardBody } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { callApi } from '@/lib/api-client';
import { Activity, AlertTriangle, CheckCircle2, Clock, Server, XCircle } from 'lucide-react';
import { useEffect, useState } from 'react';

const POLL_INTERVAL_MS = 30_000;

interface Dependency {
  status: 'ok' | 'error';
  latencyMs: number;
  error?: string;
}

interface HealthResponse {
  status: 'ok' | 'error';
  version: string;
  timestamp: string;
  dependencies: Record<string, Dependency>;
}

interface MarketplaceApi {
  id: string;
  name: string;
  providerName?: string;
  isThirdParty?: boolean;
  availabilityPct: number | null;
}

const DEPENDENCY_LABELS: Record<string, string> = {
  database: 'Database',
  cache: 'Cache',
  facilitator: 'Payment facilitator',
};

function AvailabilityBadge({ pct }: { pct: number | null }) {
  if (pct === null) return <Badge tone="default">No data yet</Badge>;
  if (pct >= 99) return <Badge tone="success" dot>{pct.toFixed(2)}%</Badge>;
  if (pct >= 95) return <Badge tone="warning" dot>{pct.toFixed(2)}%</Badge>;
  return <Badge tone="danger" dot>{pct.toFixed(2)}%</Badge>;
}

function DependencyRow({ name, dep }: { name: string; dep: Dependency }) {
  const ok = dep.status === 'ok';
  return (
    <div className="flex items-center justify-between gap-4 border-b border-border py-3 last:border-0">
      <div className="flex items-center gap-2.5">
        <span className={ok ? 'text-success' : 'text-danger'}>
          {ok ? <CheckCircle2 className="h-4 w-4" /> : <XCircle className="h-4 w-4" />}
        </span>
        <span className="text-sm font-medium text-foreground">{DEPENDENCY_LABELS[name] ?? name}</span>
        {!ok && dep.error && <span className="hidden text-xs text-muted-2 sm:inline">— {dep.error}</span>}
      </div>
      <div className="flex items-center gap-3">
        <span className="flex items-center gap-1 text-xs text-muted-2">
          <Clock className="h-3 w-3" />
          {dep.latencyMs}ms
        </span>
        <Badge tone={ok ? 'success' : 'danger'} dot>
          {ok ? 'Operational' : 'Down'}
        </Badge>
      </div>
    </div>
  );
}

export default function StatusPage() {
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [healthError, setHealthError] = useState(false);
  const [thirdPartyApis, setThirdPartyApis] = useState<MarketplaceApi[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastChecked, setLastChecked] = useState<Date | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load(): Promise<void> {
      const [healthRes, marketplaceRes] = await Promise.all([
        callApi<HealthResponse>('/health'),
        callApi<{ apis: MarketplaceApi[] }>('/v1/marketplace'),
      ]);
      if (cancelled) return;

      if (healthRes.status === 200 || healthRes.status === 503) {
        setHealth(healthRes.body);
        setHealthError(false);
      } else {
        setHealth(null);
        setHealthError(true);
      }

      if (marketplaceRes.status === 200) {
        setThirdPartyApis(marketplaceRes.body.apis.filter((api) => api.isThirdParty));
      }

      setLoading(false);
      setLastChecked(new Date());
    }

    void load();
    const interval = setInterval(() => void load(), POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  const overallHealthy = health?.status === 'ok' && !healthError;
  const withAvailabilityData = thirdPartyApis.filter((api) => api.availabilityPct !== null);
  const aggregateAvailability =
    withAvailabilityData.length > 0
      ? withAvailabilityData.reduce((sum, api) => sum + (api.availabilityPct ?? 0), 0) / withAvailabilityData.length
      : null;

  return (
    <div className="mx-auto max-w-4xl px-6 py-12">
      <Badge tone="accent" icon={<Activity className="h-3 w-3" />}>
        Status
      </Badge>
      <h1 className="mt-4 font-display text-4xl font-bold tracking-tight text-foreground sm:text-5xl">
        System status
      </h1>
      <p className="mt-3 max-w-2xl text-lg leading-relaxed text-muted">
        Live health of first-party infrastructure, plus rolling 90-day availability across the marketplace.
      </p>

      {loading ? (
        <Card className="mt-10">
          <CardBody>
            <Skeleton className="h-8 w-64" />
          </CardBody>
        </Card>
      ) : (
        <Card className="mt-10">
          <CardBody>
            <div className="flex items-center gap-3">
              <span className={overallHealthy ? 'text-success' : 'text-danger'}>
                {overallHealthy ? <CheckCircle2 className="h-6 w-6" /> : <AlertTriangle className="h-6 w-6" />}
              </span>
              <div>
                <p className="font-display text-lg font-bold text-foreground">
                  {overallHealthy ? 'All systems operational' : 'Degraded — one or more dependencies are down'}
                </p>
                {lastChecked && (
                  <p className="text-xs text-muted-2">Last checked {lastChecked.toLocaleTimeString()}</p>
                )}
              </div>
            </div>
          </CardBody>
        </Card>
      )}

      <div className="mt-10">
        <div className="flex items-center gap-2">
          <Server className="h-4 w-4 text-muted" />
          <h2 className="font-display text-xl font-bold tracking-tight text-foreground">First-party infrastructure</h2>
        </div>
        <p className="mt-1 text-sm text-muted">The API gateway's own dependencies — database, cache, and payment facilitator.</p>
        <Card className="mt-4">
          <CardBody>
            {loading && (
              <div className="space-y-3">
                <Skeleton className="h-6 w-full" />
                <Skeleton className="h-6 w-full" />
              </div>
            )}
            {!loading && health && Object.entries(health.dependencies).map(([name, dep]) => (
              <DependencyRow key={name} name={name} dep={dep} />
            ))}
            {!loading && !health && (
              <p className="text-sm text-danger">Unable to reach the API — the gateway itself may be down.</p>
            )}
          </CardBody>
        </Card>
      </div>

      <div className="mt-10">
        <div className="flex items-center gap-2">
          <Activity className="h-4 w-4 text-muted" />
          <h2 className="font-display text-xl font-bold tracking-tight text-foreground">Marketplace availability</h2>
        </div>
        <p className="mt-1 text-sm text-muted">
          Rolling 90-day uptime for third-party listings, blended from real traffic and periodic synthetic checks. New
          or low-traffic listings show "No data yet" rather than a fabricated number.
        </p>
        <Card className="mt-4">
          <CardBody>
            {loading && (
              <div className="space-y-3">
                <Skeleton className="h-6 w-full" />
                <Skeleton className="h-6 w-full" />
              </div>
            )}
            {!loading && thirdPartyApis.length === 0 && (
              <p className="text-sm text-muted">No third-party listings published yet.</p>
            )}
            {!loading && thirdPartyApis.length > 0 && (
              <>
                <div className="flex items-center justify-between border-b border-border pb-3">
                  <span className="text-sm font-semibold text-foreground">Aggregate availability</span>
                  <AvailabilityBadge pct={aggregateAvailability} />
                </div>
                {thirdPartyApis.map((api) => (
                  <div key={api.id} className="flex items-center justify-between gap-4 border-b border-border py-3 last:border-0">
                    <div>
                      <p className="text-sm font-medium text-foreground">{api.name}</p>
                      {api.providerName && <p className="text-xs text-muted-2">{api.providerName}</p>}
                    </div>
                    <AvailabilityBadge pct={api.availabilityPct} />
                  </div>
                ))}
              </>
            )}
          </CardBody>
        </Card>
      </div>
    </div>
  );
}
