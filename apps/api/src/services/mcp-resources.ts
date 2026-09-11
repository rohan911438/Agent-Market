import type { AppContext } from '../context.js';
import { buildMergedCatalog } from './catalog.js';
import { computeProviderTrust } from './trust-score.js';

export interface McpResourceDescriptor {
  uri: string;
  name: string;
  description: string;
  mimeType: string;
}

export interface McpResourceContents {
  uri: string;
  mimeType: string;
  text: string;
}

/**
 * Static resource descriptors (Phase 7) — every one is generated on read
 * from the exact same read models the REST/storefront surfaces already use
 * (services/catalog.ts, trust-score.ts), never a parallel data source. The
 * two templated ones (`api`/`provider`) are listed here with a placeholder
 * id; `resources/list` doesn't enumerate every concrete listing/provider
 * (that's what `marketplace://catalog` is for) — an agent reads a concrete
 * one directly once it has an id from the catalog.
 */
export const MCP_RESOURCE_DESCRIPTORS: McpResourceDescriptor[] = [
  {
    uri: 'marketplace://catalog',
    name: 'Full catalog',
    description: 'Every first- and third-party listing currently in the marketplace, with pricing and status.',
    mimeType: 'application/json',
  },
  {
    uri: 'marketplace://pricing',
    name: 'Pricing sheet',
    description: 'Just the id/name/price/pricing-model of every listing — for a quick cost comparison.',
    mimeType: 'application/json',
  },
  {
    uri: 'marketplace://status',
    name: 'Catalog availability',
    description: 'Live availability status for every listing (Phase 09 uptime data).',
    mimeType: 'application/json',
  },
];

const NOT_FOUND_TEXT = (uri: string) => JSON.stringify({ error: 'NOT_FOUND', message: `No resource at "${uri}".` });

export async function readMcpResource(ctx: AppContext, uri: string): Promise<McpResourceContents> {
  if (uri === 'marketplace://catalog') {
    const { apis } = await buildMergedCatalog(ctx);
    return { uri, mimeType: 'application/json', text: JSON.stringify(apis) };
  }

  if (uri === 'marketplace://pricing') {
    const { apis } = await buildMergedCatalog(ctx);
    const pricing = apis.map((a) => ({ id: a.id, slug: a.slug, name: a.name, priceUsd: a.priceUsd, priceLabel: a.priceLabel, pricingModel: a.pricingModel }));
    return { uri, mimeType: 'application/json', text: JSON.stringify(pricing) };
  }

  if (uri === 'marketplace://status') {
    const { apis } = await buildMergedCatalog(ctx);
    const status = apis.map((a) => ({ id: a.id, slug: a.slug, name: a.name, status: a.status, isThirdParty: a.isThirdParty ?? false }));
    return { uri, mimeType: 'application/json', text: JSON.stringify(status) };
  }

  const apiMatch = /^marketplace:\/\/api\/(.+)$/.exec(uri);
  if (apiMatch) {
    const idOrSlug = decodeURIComponent(apiMatch[1]!);
    const { apis } = await buildMergedCatalog(ctx);
    const api = apis.find((a) => a.id === idOrSlug || a.slug === idOrSlug);
    if (!api) return { uri, mimeType: 'application/json', text: NOT_FOUND_TEXT(uri) };
    return { uri, mimeType: 'application/json', text: JSON.stringify(api) };
  }

  const providerMatch = /^marketplace:\/\/provider\/(.+)$/.exec(uri);
  if (providerMatch) {
    const providerId = decodeURIComponent(providerMatch[1]!);
    const account = await ctx.db.providerAccounts.findById(providerId);
    if (!account) return { uri, mimeType: 'application/json', text: NOT_FOUND_TEXT(uri) };
    const trust = await computeProviderTrust(ctx, account);
    // Deliberately NOT toProviderAccountView (services/provider-account-view.ts)
    // — that shape includes the account's email, meant only for the
    // authenticated owner/an admin (see its own usage). This resource is
    // public over MCP, so it exposes only what's already public on a
    // marketplace listing card: name, status, trust ladder.
    const publicView = { id: account.id, name: account.name, status: account.status, verificationTier: trust.verificationTier, trustScore: trust.trustScore };
    return { uri, mimeType: 'application/json', text: JSON.stringify(publicView) };
  }

  return { uri, mimeType: 'application/json', text: NOT_FOUND_TEXT(uri) };
}
