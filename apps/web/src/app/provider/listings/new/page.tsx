'use client';

import { Button } from '@/components/ui/button';
import { Card, CardBody } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { createListing, errorMessage } from '@/lib/provider-api';
import { useProviderSession } from '@/lib/provider-context';
import { ArrowLeft, Upload } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

export default function NewListingPage() {
  const { session, hydrated } = useProviderSession();
  const router = useRouter();

  const [slug, setSlug] = useState('');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('');
  const [tags, setTags] = useState('');
  const [upstreamUrl, setUpstreamUrl] = useState('');
  const [docsUrl, setDocsUrl] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(): Promise<void> {
    if (!session) return;
    setSubmitting(true);
    setError(null);
    const res = await createListing(session.apiKey, {
      slug,
      name,
      description,
      category,
      tags: tags
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean),
      upstreamUrl,
      docsUrl: docsUrl || undefined,
    });
    setSubmitting(false);
    if (res.status === 201) {
      router.push(`/provider/listings/${res.body.id}`);
    } else {
      setError(errorMessage(res.body, 'Could not create the listing — check the fields and try again.'));
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

  const canSubmit = slug && name && description.length >= 10 && category && upstreamUrl;

  return (
    <div className="mx-auto max-w-2xl px-6 py-12">
      <Link href="/provider" className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted hover:text-foreground">
        <ArrowLeft className="h-3.5 w-3.5" /> Back to dashboard
      </Link>

      <div className="mb-6 flex items-center gap-2.5">
        <Upload className="h-5 w-5 text-primary" />
        <h1 className="font-display text-2xl font-bold tracking-tight text-foreground">Upload an API</h1>
      </div>

      <Card>
        <CardBody className="space-y-4">
          <Input
            label="Slug"
            hint="lowercase, hyphens only — this becomes part of its identity in the catalog"
            value={slug}
            onChange={(e) => setSlug(e.target.value)}
            placeholder="chainscan-wallet-risk"
            className="font-mono text-sm"
          />
          <Input label="Name" value={name} onChange={(e) => setName(e.target.value)} placeholder="ChainScan — Wallet Risk Feed" />
          <Textarea
            label="Description"
            hint={`${description.length}/2000`}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Flags wallets with elevated on-chain risk before a payout."
            rows={3}
          />
          <div className="grid gap-4 sm:grid-cols-2">
            <Input label="Category" value={category} onChange={(e) => setCategory(e.target.value)} placeholder="Risk & Compliance" />
            <Input label="Tags" hint="comma-separated" value={tags} onChange={(e) => setTags(e.target.value)} placeholder="wallets, fraud, on-chain" />
          </div>
          <Input
            label="Upstream URL"
            hint="where AgentMarket will eventually proxy calls to"
            value={upstreamUrl}
            onChange={(e) => setUpstreamUrl(e.target.value)}
            placeholder="https://api.yourcompany.com/v1/wallet-risk"
            className="font-mono text-sm"
          />
          <Input
            label="Docs URL (optional)"
            value={docsUrl}
            onChange={(e) => setDocsUrl(e.target.value)}
            placeholder="https://docs.yourcompany.com"
            className="font-mono text-sm"
          />

          {error && <p className="text-sm text-danger">{error}</p>}

          <Button className="w-full" variant="gradient" loading={submitting} disabled={!canSubmit} onClick={() => void handleSubmit()}>
            Create draft listing
          </Button>
          <p className="text-center text-xs text-muted-2">
            You&apos;ll configure pricing, payout and publish it from the next screen.
          </p>
        </CardBody>
      </Card>
    </div>
  );
}
