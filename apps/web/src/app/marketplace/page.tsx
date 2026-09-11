'use client';

import { AnimatedCounter } from '@/components/ui/animated-counter';
import { Badge } from '@/components/ui/badge';
import { Card, CardBody } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { SkeletonCard } from '@/components/ui/skeleton';
import { callApi } from '@/lib/api-client';
import { verificationTierBadge } from '@/lib/provider-status';
import { motion } from 'framer-motion';
import { ArrowDownAZ, ArrowUpDown, Award, PackageSearch, Search, ShieldCheck, Sparkles, Star, TrendingUp } from 'lucide-react';
import type { ReactNode } from 'react';
import { useEffect, useMemo, useState } from 'react';

interface MarketplaceApi {
  id: string;
  slug: string;
  name: string;
  description: string;
  category: string;
  priceUsd: number;
  pricingModel: 'pay_per_call' | 'subscription' | 'bundle';
  priceLabel: string;
  endpoint: string;
  status: 'live' | 'beta';
  providerName?: string;
  isThirdParty?: boolean;
  providerVerificationTier?: string;
  isNew: boolean;
  callCount7d: number;
  avgRating: number | null;
  reviewCount: number;
}

interface MarketplaceCollection {
  slug: string;
  name: string;
  description: string;
  listings: MarketplaceApi[];
}

type SortKey = 'name' | 'price-asc' | 'price-desc';

function RatingDisplay({ avgRating, reviewCount }: { avgRating: number | null; reviewCount: number }) {
  // Schema placeholder only (Phase 10) — no review submission flow exists yet,
  // so this is always the honest empty state today, never a fabricated value.
  if (avgRating === null || reviewCount === 0) {
    return <span className="text-xs text-muted-2">No reviews yet</span>;
  }
  return (
    <span className="flex items-center gap-1 text-xs text-muted-2">
      <Star className="h-3 w-3 fill-current text-warning" />
      {avgRating.toFixed(1)} ({reviewCount})
    </span>
  );
}

function ListingCard({ api }: { api: MarketplaceApi }) {
  const tier = api.isThirdParty && api.providerVerificationTier ? verificationTierBadge(api.providerVerificationTier) : null;

  return (
    <Card interactive className="flex h-full flex-col">
      <CardBody className="flex flex-1 flex-col">
        <div className="mb-2 flex items-center justify-between gap-2">
          <Badge tone={api.status === 'live' ? 'success' : 'warning'} dot>
            {api.status}
          </Badge>
          <span className="text-sm font-semibold text-accent">{api.priceLabel}</span>
        </div>
        <div className="mb-2 flex flex-wrap items-center gap-1.5">
          <h3 className="font-medium text-foreground">{api.name}</h3>
          <Badge tone="default">{api.category}</Badge>
          {api.isNew && <Badge tone="accent">New</Badge>}
          {tier && <Badge tone={tier.tone}>{tier.label}</Badge>}
        </div>
        <p className="flex-1 text-sm text-muted">{api.description}</p>
        {api.isThirdParty && api.providerName && <p className="mt-2 text-xs text-muted-2">by {api.providerName}</p>}
        <div className="mt-3 flex items-center justify-between gap-2">
          <p className="truncate font-mono text-xs text-muted-2">{api.endpoint}</p>
          <RatingDisplay avgRating={api.avgRating} reviewCount={api.reviewCount} />
        </div>
      </CardBody>
    </Card>
  );
}

function Shelf({ title, icon, items, emptyMessage }: { title: string; icon: ReactNode; items: MarketplaceApi[]; emptyMessage: string }) {
  return (
    <section className="mt-10">
      <div className="mb-3 flex items-center gap-2">
        {icon}
        <h2 className="font-display text-lg font-bold tracking-tight text-foreground">{title}</h2>
        <span className="text-xs text-muted-2">({items.length})</span>
      </div>
      {items.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border px-4 py-6 text-center text-sm text-muted">{emptyMessage}</div>
      ) : (
        <div className="scrollbar-thin -mx-1 flex gap-4 overflow-x-auto px-1 pb-2">
          {items.map((api) => (
            <div key={api.id} className="w-72 shrink-0">
              <ListingCard api={api} />
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

export default function MarketplacePage() {
  const [apis, setApis] = useState<MarketplaceApi[]>([]);
  const [collections, setCollections] = useState<MarketplaceCollection[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('all');
  const [sort, setSort] = useState<SortKey>('name');

  useEffect(() => {
    void callApi<{ apis: MarketplaceApi[]; collections: MarketplaceCollection[] }>('/v1/marketplace').then((res) => {
      if (res.status === 200) {
        setApis(res.body.apis);
        setCollections(res.body.collections);
      }
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

  // Curated only — hidden entirely (not a "zero results" filter state) if nothing has been curated yet.
  const featured = useMemo(() => collections.find((c) => c.slug === 'featured')?.listings ?? [], [collections]);
  // Real 7-day call volume (Phase 9 data) — never a fabricated ranking.
  const trending = useMemo(() => [...apis].filter((a) => a.callCount7d > 0).sort((a, b) => b.callCount7d - a.callCount7d).slice(0, 8), [apis]);
  const verified = useMemo(() => apis.filter((a) => a.providerVerificationTier === 'verified'), [apis]);
  const enterpriseReady = useMemo(() => apis.filter((a) => a.providerVerificationTier === 'verified_enterprise'), [apis]);
  const newListings = useMemo(() => apis.filter((a) => a.isNew), [apis]);

  return (
    <div className="mx-auto max-w-6xl px-6 py-12">
      <div className="flex flex-col gap-2">
        <h1 className="font-display text-4xl font-bold tracking-tight text-foreground">Marketplace</h1>
        <p className="max-w-2xl text-muted">
          Every metered endpoint AgentMarket offers, read live from the same registry the API serves requests
          from.
        </p>
      </div>

      {!loading && (
        <>
          {featured.length > 0 && (
            <Shelf title="Featured" icon={<Sparkles className="h-4 w-4 text-primary" />} items={featured} emptyMessage="" />
          )}
          <Shelf
            title="Trending"
            icon={<TrendingUp className="h-4 w-4 text-primary" />}
            items={trending}
            emptyMessage="Nothing has been called in the last 7 days yet — check back once real traffic starts flowing."
          />
          <Shelf
            title="Verified"
            icon={<ShieldCheck className="h-4 w-4 text-primary" />}
            items={verified}
            emptyMessage="No verified providers yet."
          />
          <Shelf
            title="Enterprise Ready"
            icon={<Award className="h-4 w-4 text-primary" />}
            items={enterpriseReady}
            emptyMessage="No providers have completed a security audit yet."
          />
          <Shelf title="New" icon={<Sparkles className="h-4 w-4 text-primary" />} items={newListings} emptyMessage="Nothing published in the last 14 days." />
        </>
      )}

      <section className="mt-12">
        <h2 className="font-display text-lg font-bold tracking-tight text-foreground">All APIs</h2>

        <div className="mt-4 flex flex-col gap-3 sm:flex-row">
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
          <ArrowUpDown className="h-3.5 w-3.5" />
          <AnimatedCounter value={filtered.length} /> of <AnimatedCounter value={apis.length} /> endpoints
        </div>

        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          {loading && Array.from({ length: 6 }).map((_, i) => <SkeletonCard key={i} />)}

          {!loading &&
            filtered.map((api, i) => (
              <motion.div
                key={api.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3, delay: Math.min(i * 0.04, 0.4) }}
              >
                <ListingCard api={api} />
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
      </section>
    </div>
  );
}
