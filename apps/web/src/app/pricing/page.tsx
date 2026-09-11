'use client';

import { Badge } from '@/components/ui/badge';
import { Card, CardBody } from '@/components/ui/card';
import { callApi } from '@/lib/api-client';
import { useEffect, useState } from 'react';

interface MarketplaceApi {
  id: string;
  name: string;
  priceUsd: number;
  endpoint: string;
  status: 'live' | 'beta';
}

export default function PricingPage() {
  const [apis, setApis] = useState<MarketplaceApi[]>([]);

  useEffect(() => {
    void callApi<{ apis: MarketplaceApi[] }>('/v1/marketplace').then((res) => {
      if (res.status === 200) setApis(res.body.apis);
    });
  }, []);

  return (
    <div className="mx-auto max-w-4xl px-6 py-12">
      <h1 className="text-2xl font-semibold text-white">Pricing</h1>
      <p className="mt-2 max-w-2xl text-muted">
        Pay-per-request. No subscriptions, no seats, no monthly minimums — an agent pays exactly for
        what it calls, settled on Algorand via x402.
      </p>

      <Card className="mt-8">
        <CardBody className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="text-xs uppercase text-muted">
              <tr>
                <th className="pb-3 pr-4">Endpoint</th>
                <th className="pb-3 pr-4">Price / request</th>
                <th className="pb-3">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {apis.map((api) => (
                <tr key={api.id}>
                  <td className="py-3 pr-4">
                    <div className="text-white">{api.name}</div>
                    <div className="font-mono text-xs text-muted">{api.endpoint}</div>
                  </td>
                  <td className="py-3 pr-4 font-semibold text-accent">${api.priceUsd.toFixed(2)}</td>
                  <td className="py-3">
                    <Badge tone={api.status === 'live' ? 'success' : 'warning'}>{api.status}</Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardBody>
      </Card>

      <div className="mt-8 grid gap-4 sm:grid-cols-3">
        <Card>
          <CardBody>
            <h3 className="font-medium text-white">No API keys</h3>
            <p className="mt-1 text-sm text-muted">Wallet signature replaces the credential entirely.</p>
          </CardBody>
        </Card>
        <Card>
          <CardBody>
            <h3 className="font-medium text-white">No subscriptions</h3>
            <p className="mt-1 text-sm text-muted">Every call is its own on-chain micropayment.</p>
          </CardBody>
        </Card>
        <Card>
          <CardBody>
            <h3 className="font-medium text-white">Daily spend caps</h3>
            <p className="mt-1 text-sm text-muted">Per-wallet budget limits protect against runaway agents.</p>
          </CardBody>
        </Card>
      </div>
    </div>
  );
}
