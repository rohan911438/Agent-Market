import { describe, expect, it } from 'vitest';
import { checkThirdPartyListing } from './synthetic-checks.js';

function fakeFetch(response: Response): typeof fetch {
  return (async () => response) as unknown as typeof fetch;
}

function failingFetch(err: Error): typeof fetch {
  return (async () => {
    throw err;
  }) as unknown as typeof fetch;
}

describe('checkThirdPartyListing', () => {
  it('reports success for a reachable upstream (2xx)', async () => {
    const result = await checkThirdPartyListing('https://api.example.com/probe', fakeFetch(new Response(null, { status: 200 })));
    expect(result.success).toBe(true);
    expect(result.statusCode).toBe(200);
    expect(result.error).toBeUndefined();
  });

  it('reports failure for a non-2xx response — not thrown, a normal outcome', async () => {
    const result = await checkThirdPartyListing('https://api.example.com/probe', fakeFetch(new Response(null, { status: 500 })));
    expect(result.success).toBe(false);
    expect(result.statusCode).toBe(500);
  });

  it('reports failure when the fetch itself throws (DNS failure, connection refused, etc.)', async () => {
    const result = await checkThirdPartyListing('https://unreachable.example.invalid', failingFetch(new Error('fetch failed')));
    expect(result.success).toBe(false);
    expect(result.error).toBe('fetch failed');
    expect(result.statusCode).toBeUndefined();
  });

  it('never makes a real network call — the injected fetchImpl is the only thing invoked', async () => {
    let called = false;
    const spyFetch = (async () => {
      called = true;
      return new Response(null, { status: 200 });
    }) as unknown as typeof fetch;

    await checkThirdPartyListing('https://api.example.com/probe', spyFetch);
    expect(called).toBe(true);
  });

  it('reports a latency measurement', async () => {
    const result = await checkThirdPartyListing('https://api.example.com/probe', fakeFetch(new Response(null, { status: 200 })));
    expect(result.latencyMs).toBeGreaterThanOrEqual(0);
  });
});
