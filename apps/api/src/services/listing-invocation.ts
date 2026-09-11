import type { ICache } from '@agentmarket/cache';
import { buildCacheKey } from '@agentmarket/cache';
import { AppError } from '@rohankumar4179/shared-types';
import type { ApiListing } from '@prisma/client';
import { extractOperations, type OpenApiOperation } from './openapi-spec.js';

const INVOKE_TIMEOUT_MS = 15_000;

/**
 * Third-party responses have no per-listing freshness policy the way
 * first-party data does (services/../ttl-policy.ts's CACHE_TTL_SECONDS is
 * curated per known data type — there's no such editorial judgment
 * available for an arbitrary provider's arbitrary endpoint). 30s is a
 * conservative default: short enough that no agent notices staleness, long
 * enough to absorb the common case of several agents asking the same
 * question in a burst — the same courtesy first-party routes already
 * extend to CoinGecko/Binance/etc. via ctx.cache.getOrSet.
 */
const THIRD_PARTY_CACHE_TTL_SECONDS = 30;

/**
 * Blocks the address ranges a listing's `upstreamUrl` (provider-controlled,
 * see listing-publish-gate.ts — publish time only checks it's a well-formed
 * http(s) URL, nothing about *where* it points) could otherwise use to reach
 * internal infrastructure through this server's own network position: RFC
 * 1918 private ranges, loopback, link-local (which also covers the common
 * cloud metadata endpoint 169.254.169.254), and IPv6 equivalents. This is a
 * literal/hostname check, not a DNS-rebinding-proof resolver — see the MCP
 * phase's Known Limitations for why that's an accepted gap for this pass.
 */
const BLOCKED_HOSTNAME_PATTERNS: RegExp[] = [
  /^localhost$/i,
  /^127\./,
  /^10\./,
  /^192\.168\./,
  /^172\.(1[6-9]|2\d|3[0-1])\./,
  /^169\.254\./,
  /^0\.0\.0\.0$/,
  /^\[?::1\]?$/,
  /^\[?fc[0-9a-f]{2}:/i,
  /^\[?fe80:/i,
];

export function assertSafeUpstreamUrl(url: URL): void {
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new AppError('PROVIDER_UNAVAILABLE', `Listing upstream uses an unsupported protocol "${url.protocol}".`, 502);
  }
  const hostname = url.hostname;
  if (BLOCKED_HOSTNAME_PATTERNS.some((pattern) => pattern.test(hostname))) {
    throw new AppError('PROVIDER_UNAVAILABLE', 'Listing upstream resolves to a blocked internal address.', 502);
  }
}

/** Finds the one operation this tool/MCP-call refers to, from the listing's own on-file spec — never a caller-supplied path. */
export function resolveListingOperation(listing: ApiListing, operationId: string): OpenApiOperation {
  if (!listing.parsedOpenApiSpec) {
    throw new AppError('NOT_FOUND', 'This listing has no OpenAPI spec on file.', 404);
  }
  let document: Record<string, unknown>;
  try {
    document = JSON.parse(listing.parsedOpenApiSpec) as Record<string, unknown>;
  } catch {
    throw new AppError('PROVIDER_UNAVAILABLE', 'This listing\'s stored OpenAPI spec is unreadable.', 502);
  }
  const operation = extractOperations(document).find((op) => op.operationId === operationId);
  if (!operation) {
    throw new AppError('NOT_FOUND', `Unknown operation "${operationId}" for listing "${listing.slug}".`, 404);
  }
  return operation;
}

/**
 * Builds the real upstream request for one operation: path params substituted
 * into `operation.path` (never left as caller-supplied raw path segments —
 * only the listing's own declared `{param}` placeholders are filled in),
 * remaining params as a query string (GET/DELETE) or JSON body (everything
 * else). Every path/query value is placed via `URL`'s own encoding, not
 * string concatenation, so a param value can't smuggle extra path segments.
 */
export function buildUpstreamRequest(
  listing: ApiListing,
  operation: OpenApiOperation,
  params: Record<string, unknown>,
): { url: URL; init: RequestInit } {
  let path = operation.path;
  const remaining: Record<string, unknown> = { ...params };

  for (const param of operation.parameters) {
    if (param.in !== 'path') continue;
    const value = remaining[param.name];
    if (value === undefined) {
      if (param.required) {
        throw new AppError('VALIDATION_ERROR', `Missing required path parameter "${param.name}".`, 400);
      }
      continue;
    }
    path = path.replace(`{${param.name}}`, encodeURIComponent(String(value)));
    delete remaining[param.name];
  }

  const url = new URL(`${listing.upstreamUrl.replace(/\/$/, '')}${path}`);
  assertSafeUpstreamUrl(url);

  const method = operation.method.toUpperCase();
  if (method === 'GET' || method === 'DELETE' || method === 'HEAD') {
    for (const param of operation.parameters) {
      if (param.in !== 'query') continue;
      const value = remaining[param.name];
      if (value === undefined) continue;
      url.searchParams.set(param.name, String(value));
      delete remaining[param.name];
    }
    return { url, init: { method } };
  }

  return {
    url,
    init: { method, headers: { 'content-type': 'application/json' }, body: JSON.stringify(remaining) },
  };
}

export interface UpstreamInvocationResult {
  statusCode: number;
  body: unknown;
}

/**
 * Actually calls the third-party listing's upstream — the one place in this
 * phase that makes a real outbound request to provider infrastructure this
 * platform doesn't control. Timeout-bounded so one slow/hanging provider can
 * never pin an MCP tool call (or the Fastify worker serving it) indefinitely.
 */
export async function invokeUpstreamListing(
  listing: ApiListing,
  operationId: string,
  params: Record<string, unknown>,
  fetchImpl: typeof fetch = fetch,
): Promise<UpstreamInvocationResult> {
  const operation = resolveListingOperation(listing, operationId);
  const { url, init } = buildUpstreamRequest(listing, operation, params);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), INVOKE_TIMEOUT_MS);
  try {
    const res = await fetchImpl(url.toString(), { ...init, signal: controller.signal });
    const text = await res.text();
    let body: unknown;
    try {
      body = text.length > 0 ? JSON.parse(text) : null;
    } catch {
      body = text;
    }
    return { statusCode: res.status, body };
  } catch (err) {
    const reason = err instanceof Error && err.name === 'AbortError' ? 'timed out' : 'was unreachable';
    throw new AppError('PROVIDER_UNAVAILABLE', `Listing "${listing.slug}" ${reason}.`, 502, {
      cause: err instanceof Error ? err.message : String(err),
    });
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Cache-aware wrapper around `invokeUpstreamListing` — only for read
 * (GET/HEAD) operations, mirroring the exact convention first-party routes
 * already follow (`sentiment.route.ts`/`analyze.route.ts` cache their GETs
 * via `ctx.cache.getOrSet`; `portfolio-health.route.ts`, a POST, explicitly
 * never does). A non-safe operation (POST/PUT/PATCH/DELETE) may have side
 * effects on the provider's side, so it is never deduplicated here — every
 * call reaches the real upstream. The x402 payment gate is unaffected
 * either way: a cache hit still charges the caller the listing's full
 * price, exactly like a first-party cache hit does — this only saves a
 * repeat network round trip to a provider we don't operate, not the
 * provider's own metering of us.
 *
 * A non-2xx upstream response is deliberately never cached (`getOrSet`
 * alone can't express that: it treats a resolved value, error or not, as
 * cacheable) — a transient provider failure shouldn't be memoized for the
 * full TTL window when the provider might already be healthy on the very
 * next call.
 */
export async function invokeUpstreamListingCached(
  cache: ICache,
  listing: ApiListing,
  operationId: string,
  params: Record<string, unknown>,
  fetchImpl: typeof fetch = fetch,
): Promise<UpstreamInvocationResult & { cacheHit: boolean }> {
  const operation = resolveListingOperation(listing, operationId);
  const isSafeMethod = operation.method === 'get' || operation.method === 'head';

  if (!isSafeMethod) {
    const result = await invokeUpstreamListing(listing, operationId, params, fetchImpl);
    return { ...result, cacheHit: false };
  }

  const cacheKey = buildCacheKey(`listing-invoke:${listing.slug}`, {
    operationId,
    // Object.keys(params).sort() as JSON.stringify's replacer gives a
    // deterministic key order regardless of how the caller built `params`,
    // without needing a general-purpose deep-sorting serializer — shallow
    // params (the common case: query/path values) round-trip exactly;
    // a param that is itself an object keeps whatever key order it already
    // had, which only affects the cache HIT RATE, never correctness.
    params: JSON.stringify(params, Object.keys(params).sort()),
  });

  const cached = await cache.get<UpstreamInvocationResult>(cacheKey);
  if (cached) return { ...cached, cacheHit: true };

  const result = await invokeUpstreamListing(listing, operationId, params, fetchImpl);
  if (result.statusCode < 400) {
    await cache.set(cacheKey, result, THIRD_PARTY_CACHE_TTL_SECONDS);
  }
  return { ...result, cacheHit: false };
}
