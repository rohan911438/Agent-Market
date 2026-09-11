'use client';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardBody, CardHeader, CardTitle } from '@/components/ui/card';
import { CopyButton } from '@/components/ui/copy-button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import {
  configureListingPayment,
  configureListingPricing,
  errorMessage,
  getListing,
  getProviderMe,
  publishListing,
} from '@/lib/provider-api';
import { useProviderSession } from '@/lib/provider-context';
import { listingStatusBadge, providerStatusBadge } from '@/lib/provider-status';
import type { ApiListingView, PricingModel, ProviderAccountView, PublishRequirement } from '@rohankumar4179/shared-types';
import { ArrowLeft, Check, CircleDollarSign, Rocket, Wallet, X } from 'lucide-react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useEffect, useState } from 'react';

interface Requirement {
  key: string;
  met: boolean;
  message: string;
}

function computeChecklist(account: ProviderAccountView | null, listing: ApiListingView): Requirement[] {
  return [
    {
      key: 'provider_verified',
      met: account?.status === 'verified',
      message: 'Provider account must pass verification.',
    },
    { key: 'pricing_configured', met: listing.priceUsd != null && listing.priceUsd > 0, message: 'Configure a price.' },
    { key: 'payment_configured', met: Boolean(listing.payoutWalletAddress), message: 'Configure a payout wallet.' },
    {
      key: 'upstream_url_valid',
      met: /^https?:\/\//i.test(listing.upstreamUrl),
      message: 'upstreamUrl must be a valid http(s) URL.',
    },
    {
      key: 'description_present',
      met: listing.description.trim().length >= 10,
      message: 'Description must be at least 10 characters.',
    },
  ];
}

function ChecklistItem({ item }: { item: Requirement }) {
  return (
    <li className="flex items-start gap-2.5 text-sm">
      <span
        className={`mt-0.5 flex h-4.5 w-4.5 shrink-0 items-center justify-center rounded-full ${item.met ? 'bg-success-bg text-success' : 'bg-surface-hover text-muted-2'}`}
      >
        {item.met ? <Check className="h-3 w-3" /> : <X className="h-3 w-3" />}
      </span>
      <span className={item.met ? 'text-muted' : 'text-foreground'}>{item.message}</span>
    </li>
  );
}

export default function ListingDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { session, hydrated } = useProviderSession();

  const [account, setAccount] = useState<ProviderAccountView | null>(null);
  const [listing, setListing] = useState<ApiListingView | null>(null);
  const [notFound, setNotFound] = useState(false);

  const [pricingModel, setPricingModel] = useState<PricingModel>('pay_per_call');
  const [priceUsd, setPriceUsd] = useState('');
  const [savingPricing, setSavingPricing] = useState(false);
  const [pricingError, setPricingError] = useState<string | null>(null);

  const [payoutWalletAddress, setPayoutWalletAddress] = useState('');
  const [savingPayment, setSavingPayment] = useState(false);
  const [paymentError, setPaymentError] = useState<string | null>(null);

  const [publishing, setPublishing] = useState(false);
  const [publishError, setPublishError] = useState<string | null>(null);
  const [serverRequirements, setServerRequirements] = useState<PublishRequirement[] | null>(null);

  useEffect(() => {
    if (!session || !id) return;
    void (async () => {
      const [me, l] = await Promise.all([getProviderMe(session.apiKey), getListing(session.apiKey, id)]);
      if (me.status === 200) setAccount(me.body);
      if (l.status === 200) {
        setListing(l.body);
        setPricingModel(l.body.pricingModel);
        setPriceUsd(l.body.priceUsd != null ? String(l.body.priceUsd) : '');
        setPayoutWalletAddress(l.body.payoutWalletAddress ?? '');
      } else {
        setNotFound(true);
      }
    })();
  }, [session, id]);

  async function handleSavePricing(): Promise<void> {
    if (!session || !listing) return;
    setSavingPricing(true);
    setPricingError(null);
    const res = await configureListingPricing(session.apiKey, listing.id, { pricingModel, priceUsd: Number(priceUsd) });
    setSavingPricing(false);
    if (res.status === 200) {
      setListing(res.body);
      setServerRequirements(null);
    } else {
      setPricingError(errorMessage(res.body, 'Could not save pricing.'));
    }
  }

  async function handleSavePayment(): Promise<void> {
    if (!session || !listing) return;
    setSavingPayment(true);
    setPaymentError(null);
    const res = await configureListingPayment(session.apiKey, listing.id, { payoutWalletAddress });
    setSavingPayment(false);
    if (res.status === 200) {
      setListing(res.body);
      setServerRequirements(null);
    } else {
      setPaymentError(errorMessage(res.body, 'Could not save payout details.'));
    }
  }

  async function handlePublish(): Promise<void> {
    if (!session || !listing) return;
    setPublishing(true);
    setPublishError(null);
    setServerRequirements(null);
    const res = await publishListing(session.apiKey, listing.id);
    setPublishing(false);
    if (res.status === 200) {
      setListing(res.body);
    } else if (res.status === 422) {
      const details = (res.body as { error?: { details?: { requirements?: PublishRequirement[] } } }).error?.details;
      setServerRequirements(details?.requirements ?? null);
      setPublishError('Not ready to publish yet — see the checklist below.');
    } else {
      setPublishError(errorMessage(res.body, 'Could not publish this listing.'));
    }
  }

  if (!hydrated) return null;

  if (!session) {
    return (
      <div className="mx-auto max-w-lg px-6 py-16 text-center">
        <p className="text-muted">Sign in to your provider account first.</p>
        <Link href="/provider" className="mt-3 inline-block text-sm font-medium text-primary hover:text-primary-hover">
          Go to provider dashboard
        </Link>
      </div>
    );
  }

  if (notFound) {
    return (
      <div className="mx-auto max-w-lg px-6 py-16 text-center">
        <p className="text-muted">No listing found with that id on this account.</p>
        <Link href="/provider" className="mt-3 inline-block text-sm font-medium text-primary hover:text-primary-hover">
          Back to dashboard
        </Link>
      </div>
    );
  }

  if (!listing) {
    return (
      <div className="mx-auto max-w-3xl space-y-4 px-6 py-12">
        <div className="h-16 animate-pulse rounded-2xl border border-border bg-surface" />
        <div className="h-40 animate-pulse rounded-2xl border border-border bg-surface" />
      </div>
    );
  }

  const badge = listingStatusBadge(listing.status);
  const accountBadge = account ? providerStatusBadge(account.status) : null;
  const checklist = serverRequirements ?? computeChecklist(account, listing);
  const allMet = checklist.every((r) => r.met);
  const isPublished = listing.status === 'published';

  return (
    <div className="mx-auto max-w-3xl px-6 py-12">
      <Link href="/provider" className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted hover:text-foreground">
        <ArrowLeft className="h-3.5 w-3.5" /> Back to dashboard
      </Link>

      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="font-display text-2xl font-bold tracking-tight text-foreground">{listing.name}</h1>
            <Badge tone={badge.tone} dot>
              {badge.label}
            </Badge>
          </div>
          <p className="mt-0.5 font-mono text-xs text-muted-2">
            {listing.slug} · v{listing.version}
          </p>
        </div>
        {accountBadge && (
          <Badge tone={accountBadge.tone} dot>
            Account: {accountBadge.label}
          </Badge>
        )}
      </div>

      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Overview</CardTitle>
          </CardHeader>
          <CardBody className="space-y-3 text-sm">
            <p className="text-muted">{listing.description}</p>
            <div className="flex flex-wrap gap-1.5">
              <Badge>{listing.category}</Badge>
              {listing.tags.map((tag) => (
                <Badge key={tag} tone="default">
                  {tag}
                </Badge>
              ))}
            </div>
            <div className="flex items-center gap-2 rounded-lg border border-code-border bg-code-bg px-3 py-2">
              <code className="scrollbar-thin flex-1 overflow-x-auto whitespace-nowrap font-mono text-xs text-foreground">
                {listing.upstreamUrl}
              </code>
              <CopyButton value={listing.upstreamUrl} />
            </div>
            {listing.docsUrl && (
              <a href={listing.docsUrl} target="_blank" rel="noreferrer" className="text-xs font-medium text-primary hover:text-primary-hover">
                View documentation →
              </a>
            )}
          </CardBody>
        </Card>

        <Card>
          <CardHeader className="flex items-center gap-2">
            <CircleDollarSign className="h-4 w-4 text-primary" />
            <CardTitle>Pricing</CardTitle>
          </CardHeader>
          <CardBody className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <Select label="Model" value={pricingModel} onChange={(e) => setPricingModel(e.target.value as PricingModel)}>
                <option value="pay_per_call">Pay per call</option>
                <option value="subscription">Subscription</option>
                <option value="bundle">Bundle</option>
              </Select>
              <Input
                label="Price (USD)"
                type="number"
                min="0"
                step="0.01"
                value={priceUsd}
                onChange={(e) => setPriceUsd(e.target.value)}
                placeholder="0.03"
              />
            </div>
            {pricingError && <p className="text-sm text-danger">{pricingError}</p>}
            <Button size="sm" loading={savingPricing} disabled={!priceUsd} onClick={() => void handleSavePricing()}>
              Save pricing
            </Button>
          </CardBody>
        </Card>

        <Card>
          <CardHeader className="flex items-center gap-2">
            <Wallet className="h-4 w-4 text-primary" />
            <CardTitle>Payment</CardTitle>
          </CardHeader>
          <CardBody className="space-y-4">
            <Input
              label="Payout wallet address"
              hint="where your share of every settlement lands"
              value={payoutWalletAddress}
              onChange={(e) => setPayoutWalletAddress(e.target.value)}
              placeholder="58-character Algorand address"
              className="font-mono text-xs"
            />
            {paymentError && <p className="text-sm text-danger">{paymentError}</p>}
            <Button size="sm" loading={savingPayment} disabled={!payoutWalletAddress} onClick={() => void handleSavePayment()}>
              Save payout details
            </Button>
          </CardBody>
        </Card>

        <Card className={isPublished ? 'border-success/30' : undefined}>
          <CardHeader className="flex items-center gap-2">
            <Rocket className="h-4 w-4 text-primary" />
            <CardTitle>{isPublished ? 'Live on the marketplace' : 'Before you publish'}</CardTitle>
          </CardHeader>
          <CardBody className="space-y-4">
            {!isPublished && (
              <ul className="space-y-2">
                {checklist.map((item) => (
                  <ChecklistItem key={item.key} item={item} />
                ))}
              </ul>
            )}
            {isPublished ? (
              <p className="text-sm text-muted">
                Published {listing.publishedAt ? new Date(listing.publishedAt).toLocaleString() : ''}. It now appears
                in <Link href="/marketplace" className="font-medium text-primary hover:text-primary-hover">the public marketplace</Link>{' '}
                feed alongside first-party endpoints.
              </p>
            ) : (
              <>
                {publishError && <p className="text-sm text-danger">{publishError}</p>}
                <Button variant="gradient" loading={publishing} onClick={() => void handlePublish()} icon={<Rocket className="h-4 w-4" />}>
                  {allMet ? 'Publish' : 'Try publishing anyway'}
                </Button>
              </>
            )}
          </CardBody>
        </Card>
      </div>
    </div>
  );
}
