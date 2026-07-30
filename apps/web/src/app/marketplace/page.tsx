'use client';

import { Badge } from '@/components/ui/badge';
import { Card, CardBody } from '@/components/ui/card';
import { callApi } from '@/lib/api-client';
import { useEffect, useState } from 'react';

interface MarketplaceApi {
  id: string;
  slug: string;
  name: string;
  description: string;
  category: string;
  priceUsd: number;
  endpoint: string;
  status: 'live' | 'beta';
}

export default function MarketplacePage() {
  const [apis, setApis] = useState<MarketplaceApi[]>([]);

  useEffect(() => {
    void callApi<{ apis: MarketplaceApi[] }>('/v1/marketplace').then((res) => {
      if (res.status === 200) setApis(res.body.apis);
    });
  }, []);

  return (
    <div className="mx-auto max-w-5xl px-6 py-12">
      <h1 className="text-2xl font-semibold text-white">Marketplace</h1>
      <p className="mt-2 max-w-2xl text-muted">
        Every metered endpoint AgentMarket offers, read live from the same registry the API serves
        requests from.
      </p>

      <div className="mt-8 grid gap-4 sm:grid-cols-2">
        {apis.map((api) => (
          <Card key={api.id}>
            <CardBody>
              <div className="mb-2 flex items-center justify-between">
                <Badge tone={api.status === 'live' ? 'success' : 'warning'}>{api.status}</Badge>
                <span className="text-sm font-semibold text-accent">${api.priceUsd.toFixed(2)} / call</span>
              </div>
              <h3 className="font-medium text-white">{api.name}</h3>
              <p className="mt-1 text-sm text-muted">{api.description}</p>
              <p className="mt-2 font-mono text-xs text-muted">{api.endpoint}</p>
            </CardBody>
          </Card>
        ))}
        {apis.length === 0 && <p className="text-sm text-muted">Loading marketplace…</p>}
      </div>
    </div>
  );
}
