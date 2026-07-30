'use client';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardBody, CardHeader, CardTitle } from '@/components/ui/card';
import { callApi } from '@/lib/api-client';
import { useWallet } from '@/lib/wallet-context';
import { useEffect, useState } from 'react';

interface UsageRow {
  date: string;
  route: string;
  requestCount: number;
  spendUsd: number;
}

interface RequestRow {
  id: string;
  route: string;
  statusCode: number;
  cacheHit: boolean;
  providerUsed: string | null;
  latencyMs: number;
  createdAt: string;
}

interface DashboardData {
  wallet: { address: string; network: string; isVerified: boolean };
  totalSpendUsd: number;
  totalRequests: number;
  usage: UsageRow[];
  recentRequests: RequestRow[];
}

export default function DashboardPage() {
  const { address } = useWallet();
  const [walletInput, setWalletInput] = useState('');
  const [data, setData] = useState<DashboardData | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (address) setWalletInput(address);
  }, [address]);

  async function load(wallet: string): Promise<void> {
    if (!wallet) return;
    setLoading(true);
    setNotFound(false);
    setData(null);
    const res = await callApi<DashboardData>(`/v1/dashboard?wallet=${encodeURIComponent(wallet)}`);
    setLoading(false);
    if (res.status === 200) {
      setData(res.body);
    } else {
      setNotFound(true);
    }
  }

  return (
    <div className="mx-auto max-w-5xl px-6 py-12">
      <h1 className="text-2xl font-semibold text-white">Dashboard</h1>
      <p className="mt-2 max-w-2xl text-muted">
        Usage and spend for a wallet, pulled straight from the same Payment/ApiRequest tables the API
        writes on every metered call.
      </p>

      <Card className="mt-6">
        <CardBody className="flex flex-col gap-3 sm:flex-row">
          <input
            className="flex-1 rounded-lg border border-border bg-background px-3 py-2 text-sm text-white"
            placeholder="Algorand wallet address"
            value={walletInput}
            onChange={(e) => setWalletInput(e.target.value)}
          />
          <Button onClick={() => void load(walletInput)} disabled={loading || !walletInput}>
            {loading ? 'Loading…' : 'Look up'}
          </Button>
        </CardBody>
      </Card>

      {notFound && (
        <p className="mt-4 text-sm text-muted">
          No activity found for this wallet yet — make a request in the API Explorer first.
        </p>
      )}

      {data && (
        <div className="mt-6 space-y-6">
          <div className="grid gap-4 sm:grid-cols-3">
            <Card>
              <CardBody>
                <p className="text-xs text-muted">Total spend</p>
                <p className="mt-1 text-2xl font-semibold text-white">${data.totalSpendUsd.toFixed(4)}</p>
              </CardBody>
            </Card>
            <Card>
              <CardBody>
                <p className="text-xs text-muted">Total requests</p>
                <p className="mt-1 text-2xl font-semibold text-white">{data.totalRequests}</p>
              </CardBody>
            </Card>
            <Card>
              <CardBody>
                <p className="text-xs text-muted">Wallet status</p>
                <p className="mt-1">
                  <Badge tone={data.wallet.isVerified ? 'success' : 'default'}>
                    {data.wallet.isVerified ? 'Verified (300 req/min)' : 'Unverified (30 req/min)'}
                  </Badge>
                </p>
              </CardBody>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Recent requests</CardTitle>
            </CardHeader>
            <CardBody className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="text-xs uppercase text-muted">
                  <tr>
                    <th className="pb-2 pr-4">Route</th>
                    <th className="pb-2 pr-4">Status</th>
                    <th className="pb-2 pr-4">Cache</th>
                    <th className="pb-2 pr-4">Provider</th>
                    <th className="pb-2 pr-4">Latency</th>
                    <th className="pb-2">When</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {data.recentRequests.map((row) => (
                    <tr key={row.id}>
                      <td className="py-2 pr-4 font-mono text-xs">{row.route}</td>
                      <td className="py-2 pr-4">
                        <Badge tone={row.statusCode < 400 ? 'success' : 'danger'}>{row.statusCode}</Badge>
                      </td>
                      <td className="py-2 pr-4">{row.cacheHit ? 'hit' : 'miss'}</td>
                      <td className="py-2 pr-4 text-xs text-muted">{row.providerUsed ?? '—'}</td>
                      <td className="py-2 pr-4 text-xs text-muted">{row.latencyMs}ms</td>
                      <td className="py-2 text-xs text-muted">{new Date(row.createdAt).toLocaleString()}</td>
                    </tr>
                  ))}
                  {data.recentRequests.length === 0 && (
                    <tr>
                      <td colSpan={6} className="py-4 text-center text-muted">
                        No requests yet.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </CardBody>
          </Card>
        </div>
      )}
    </div>
  );
}
