'use client';

import { AnimatedCounter } from '@/components/ui/animated-counter';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardBody, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { SkeletonRow } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeaderCell, TableRow } from '@/components/ui/table';
import { callApi } from '@/lib/api-client';
import { useWallet } from '@/lib/wallet-context';
import { motion } from 'framer-motion';
import { Activity, ClipboardList, DollarSign, LayoutDashboard, Search, ShieldCheck } from 'lucide-react';
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
      <div className="flex items-center gap-2.5">
        <LayoutDashboard className="h-6 w-6 text-primary" />
        <h1 className="font-display text-4xl font-bold tracking-tight text-foreground">Dashboard</h1>
      </div>
      <p className="mt-2 max-w-2xl text-muted">
        Usage and spend for a wallet, pulled straight from the same Payment/ApiRequest tables the API writes on
        every metered call.
      </p>

      <Card className="mt-6">
        <CardBody className="flex flex-col gap-3 sm:flex-row">
          <div className="flex-1">
            <Input
              icon={<Search className="h-4 w-4" />}
              placeholder="Algorand wallet address"
              value={walletInput}
              onChange={(e) => setWalletInput(e.target.value)}
            />
          </div>
          <Button onClick={() => void load(walletInput)} loading={loading} disabled={!walletInput}>
            Look up
          </Button>
        </CardBody>
      </Card>

      {notFound && (
        <p className="mt-4 text-sm text-muted">
          No activity found for this wallet yet — make a request in the API Explorer first.
        </p>
      )}

      {data && (
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }} className="mt-6 space-y-6">
          <div className="grid gap-4 sm:grid-cols-3">
            <Card>
              <CardBody>
                <div className="mb-1 flex items-center gap-1.5 text-xs text-muted">
                  <DollarSign className="h-3.5 w-3.5" /> Total spend
                </div>
                <p className="text-2xl font-semibold text-foreground">
                  $<AnimatedCounter value={data.totalSpendUsd} decimals={4} />
                </p>
              </CardBody>
            </Card>
            <Card>
              <CardBody>
                <div className="mb-1 flex items-center gap-1.5 text-xs text-muted">
                  <Activity className="h-3.5 w-3.5" /> Total requests
                </div>
                <p className="text-2xl font-semibold text-foreground">
                  <AnimatedCounter value={data.totalRequests} />
                </p>
              </CardBody>
            </Card>
            <Card>
              <CardBody>
                <div className="mb-1 flex items-center gap-1.5 text-xs text-muted">
                  <ShieldCheck className="h-3.5 w-3.5" /> Wallet status
                </div>
                <Badge tone={data.wallet.isVerified ? 'success' : 'default'} dot>
                  {data.wallet.isVerified ? 'Verified (300 req/min)' : 'Unverified (30 req/min)'}
                </Badge>
              </CardBody>
            </Card>
          </div>

          <Card>
            <CardHeader className="flex items-center gap-2">
              <ClipboardList className="h-4 w-4 text-primary" />
              <CardTitle>Recent requests</CardTitle>
            </CardHeader>
            <CardBody>
              <Table>
                <TableHead>
                  <TableRow>
                    <TableHeaderCell>Route</TableHeaderCell>
                    <TableHeaderCell>Status</TableHeaderCell>
                    <TableHeaderCell>Cache</TableHeaderCell>
                    <TableHeaderCell>Provider</TableHeaderCell>
                    <TableHeaderCell>Latency</TableHeaderCell>
                    <TableHeaderCell>When</TableHeaderCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {loading && Array.from({ length: 4 }).map((_, i) => <SkeletonRow key={i} cols={6} />)}
                  {!loading &&
                    data.recentRequests.map((row) => (
                      <TableRow key={row.id}>
                        <TableCell className="font-mono text-xs">{row.route}</TableCell>
                        <TableCell>
                          <Badge tone={row.statusCode < 400 ? 'success' : 'danger'}>{row.statusCode}</Badge>
                        </TableCell>
                        <TableCell>
                          <Badge tone={row.cacheHit ? 'info' : 'default'}>{row.cacheHit ? 'hit' : 'miss'}</Badge>
                        </TableCell>
                        <TableCell className="text-xs text-muted">{row.providerUsed ?? '—'}</TableCell>
                        <TableCell className="text-xs text-muted">{row.latencyMs}ms</TableCell>
                        <TableCell className="text-xs text-muted">{new Date(row.createdAt).toLocaleString()}</TableCell>
                      </TableRow>
                    ))}
                  {!loading && data.recentRequests.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={6} className="py-8 text-center text-muted">
                        No requests yet.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardBody>
          </Card>
        </motion.div>
      )}
    </div>
  );
}
