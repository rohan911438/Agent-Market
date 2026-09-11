'use client';

import { AnimatedCounter } from '@/components/ui/animated-counter';
import { Badge } from '@/components/ui/badge';
import { Card, CardBody } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { SkeletonCard } from '@/components/ui/skeleton';
import { callApi } from '@/lib/api-client';
import { motion } from 'framer-motion';
import { ArrowDownAZ, ArrowUpDown, PackageSearch, Search } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';

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

type SortKey = 'name' | 'price-asc' | 'price-desc';

export default function MarketplacePage() {
  const [apis, setApis] = useState<MarketplaceApi[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('all');
  const [sort, setSort] = useState<SortKey>('name');

  useEffect(() => {
    void callApi<{ apis: MarketplaceApi[] }>('/v1/marketplace').then((res) => {
      if (res.status === 200) setApis(res.body.apis);
      setLoading(false);
    });
  }, []);

  const categories = useMemo(() => ['all', ...Array.from(new Set(apis.map((a) => a.category)))], [apis]);

  const filtered = useMemo(() => {
    let list = apis;
    if (category !== 'all') list = list.filter((a) => a.category === category);
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter((a) => a.name.toLowerCase().includes(q) || a.description.toLowerCase().includes(q));
    }
    return [...list].sort((a, b) => {
      if (sort === 'name') return a.name.localeCompare(b.name);
      if (sort === 'price-asc') return a.priceUsd - b.priceUsd;
      return b.priceUsd - a.priceUsd;
    });
  }, [apis, category, search, sort]);

  return (
    <div className="mx-auto max-w-6xl px-6 py-12">
      <div className="flex flex-col gap-2">
        <h1 className="font-display text-4xl font-bold tracking-tight text-foreground">Marketplace</h1>
        <p className="max-w-2xl text-muted">
          Every metered endpoint AgentMarket offers, read live from the same registry the API serves requests
          from.
        </p>
      </div>

      <div className="mt-8 flex flex-col gap-3 sm:flex-row">
        <div className="flex-1">
          <Input
            placeholder="Search endpoints…"
            icon={<Search className="h-4 w-4" />}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="sm:w-48">
          <Select value={category} onChange={(e) => setCategory(e.target.value)}>
            {categories.map((c) => (
              <option key={c} value={c}>
                {c === 'all' ? 'All categories' : c}
              </option>
            ))}
          </Select>
        </div>
        <div className="sm:w-48">
          <Select value={sort} onChange={(e) => setSort(e.target.value as SortKey)}>
            <option value="name">Name (A–Z)</option>
            <option value="price-asc">Price: low to high</option>
            <option value="price-desc">Price: high to low</option>
          </Select>
        </div>
      </div>

      <div className="mt-4 flex items-center gap-1.5 text-sm text-muted-2">
        {!loading && (
          <>
            <ArrowUpDown className="h-3.5 w-3.5" />
            <AnimatedCounter value={filtered.length} /> of <AnimatedCounter value={apis.length} /> endpoints
          </>
        )}
      </div>

      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        {loading &&
          Array.from({ length: 6 }).map((_, i) => <SkeletonCard key={i} />)}

        {!loading &&
          filtered.map((api, i) => (
            <motion.div
              key={api.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, delay: Math.min(i * 0.04, 0.4) }}
            >
              <Card interactive>
                <CardBody>
                  <div className="mb-2 flex items-center justify-between">
                    <Badge tone={api.status === 'live' ? 'success' : 'warning'} dot>
                      {api.status}
                    </Badge>
                    <span className="text-sm font-semibold text-accent">${api.priceUsd.toFixed(2)} / call</span>
                  </div>
                  <div className="mb-2 flex items-center gap-2">
                    <h3 className="font-medium text-foreground">{api.name}</h3>
                    <Badge tone="default">{api.category}</Badge>
                  </div>
                  <p className="text-sm text-muted">{api.description}</p>
                  <p className="mt-3 font-mono text-xs text-muted-2">{api.endpoint}</p>
                </CardBody>
              </Card>
            </motion.div>
          ))}

        {!loading && filtered.length === 0 && (
          <div className="col-span-full flex flex-col items-center gap-3 rounded-lg border border-dashed border-border py-16 text-center">
            <span className="flex h-12 w-12 items-center justify-center rounded-full bg-surface-hover text-muted">
              <PackageSearch className="h-5 w-5" />
            </span>
            <div>
              <p className="font-medium text-foreground">No endpoints match your filters</p>
              <p className="mt-1 flex items-center justify-center gap-1 text-sm text-muted">
                Try a different search term or <ArrowDownAZ className="h-3.5 w-3.5" /> category.
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
