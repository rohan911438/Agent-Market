import { McpManifestSchema } from '@rohankumar4179/shared-types';
import { ListToolsResultSchema } from '@modelcontextprotocol/sdk/types.js';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildServer } from '../src/server.js';
import { buildTestContext } from './helpers/build-test-context.js';

const WALLET = 'C'.repeat(58);

const VALID_SPEC = JSON.stringify({
  openapi: '3.0.3',
  info: { title: 'Wallet Risk API', version: '1.0.0' },
  paths: {
    '/wallet-risk': {
      get: {
        operationId: 'getWalletRisk',
        summary: 'Get wallet risk score',
        parameters: [{ name: 'address', in: 'query', required: true, schema: { type: 'string' } }],
        responses: { 200: { description: 'OK' } },
      },
    },
  },
});

/** The MCP Streamable HTTP transport replies with an SSE frame; this pulls the JSON-RPC message out of it. */
function parseSseJsonRpc(body: string): { result?: unknown; error?: unknown; id: unknown } {
  const dataLine = body.split('\n').find((line) => line.startsWith('data:'));
  if (!dataLine) throw new Error(`No SSE data line in body: ${body}`);
  return JSON.parse(dataLine.slice('data:'.length).trim());
}

async function mcpRequest(server: FastifyInstance, payload: Record<string, unknown>) {
  const res = await server.inject({
    method: 'POST',
    url: '/mcp',
    headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream' },
    payload,
  });
  return { statusCode: res.statusCode, message: parseSseJsonRpc(res.body) };
}

describe('protocol-native catalog (Phase 4)', () => {
  let server: FastifyInstance;

  beforeAll(async () => {
    server = buildServer(buildTestContext());
    await server.ready();
  });

  afterAll(async () => {
    await server.close();
  });

  async function registerProvider(email: string) {
    const register = await server.inject({
      method: 'POST',
      url: '/v1/providers/register',
      payload: { name: 'Catalog Test Provider', email, walletAddress: WALLET },
    });
    return register.json().apiKey as string;
  }

  describe('OpenAPI validation at listing time', () => {
    it('rejects a spec that is not parseable JSON/YAML', async () => {
      const apiKey = await registerProvider('bad-spec-unparseable@catalog.test');
      const res = await server.inject({
        method: 'POST',
        url: '/v1/listings',
        headers: { authorization: `Bearer ${apiKey}` },
        payload: {
          slug: 'bad-spec-unparseable',
          name: 'Bad Spec',
          description: 'A listing with a broken spec.',
          category: 'Test',
          upstreamUrl: 'https://api.example.test/v1',
          openApiSpec: '{ this is not valid json or yaml : : :',
        },
      });
      expect(res.statusCode).toBe(400);
      expect(res.json().error.code).toBe('VALIDATION_ERROR');
    });

    it('rejects a spec with no paths', async () => {
      const apiKey = await registerProvider('bad-spec-nopaths@catalog.test');
      const res = await server.inject({
        method: 'POST',
        url: '/v1/listings',
        headers: { authorization: `Bearer ${apiKey}` },
        payload: {
          slug: 'bad-spec-nopaths',
          name: 'Bad Spec',
          description: 'A listing with an empty spec.',
          category: 'Test',
          upstreamUrl: 'https://api.example.test/v1',
          openApiSpec: JSON.stringify({ openapi: '3.0.3', info: { title: 'Empty', version: '1.0.0' }, paths: {} }),
        },
      });
      expect(res.statusCode).toBe(400);
      expect(res.json().error.code).toBe('VALIDATION_ERROR');
    });

    it('rejects a spec missing the openapi version field', async () => {
      const apiKey = await registerProvider('bad-spec-noversion@catalog.test');
      const res = await server.inject({
        method: 'POST',
        url: '/v1/listings',
        headers: { authorization: `Bearer ${apiKey}` },
        payload: {
          slug: 'bad-spec-noversion',
          name: 'Bad Spec',
          description: 'A listing with no openapi field.',
          category: 'Test',
          upstreamUrl: 'https://api.example.test/v1',
          openApiSpec: JSON.stringify({ info: { title: 'X', version: '1.0.0' }, paths: { '/x': { get: {} } } }),
        },
      });
      expect(res.statusCode).toBe(400);
      expect(res.json().error.code).toBe('VALIDATION_ERROR');
    });
  });

  describe('a published listing with a valid spec', () => {
    let apiKey: string;
    let listingId: string;
    const slug = 'wallet-risk-catalog-test';

    beforeAll(async () => {
      apiKey = await registerProvider('wallet-risk-catalog@catalog.test');

      const create = await server.inject({
        method: 'POST',
        url: '/v1/listings',
        headers: { authorization: `Bearer ${apiKey}` },
        payload: {
          slug,
          name: 'Wallet Risk',
          description: 'Flags risky wallets before a payout is made.',
          category: 'Risk',
          upstreamUrl: 'https://api.ledgerwatch.test/v1',
          openApiSpec: VALID_SPEC,
        },
      });
      listingId = create.json().id;

      await server.inject({ method: 'POST', url: '/v1/providers/verify', headers: { authorization: `Bearer ${apiKey}` } });
      await server.inject({
        method: 'PATCH',
        url: `/v1/listings/${listingId}/pricing`,
        headers: { authorization: `Bearer ${apiKey}` },
        payload: { pricingModel: 'pay_per_call', priceUsd: 0.02 },
      });
      await server.inject({
        method: 'PATCH',
        url: `/v1/listings/${listingId}/payment`,
        headers: { authorization: `Bearer ${apiKey}` },
        payload: { payoutWalletAddress: WALLET },
      });
      await server.inject({
        method: 'POST',
        url: `/v1/listings/${listingId}/publish`,
        headers: { authorization: `Bearer ${apiKey}` },
      });
    });

    it('stores the canonical parsed spec and exposes protocolDocs on the listing view', async () => {
      const res = await server.inject({
        method: 'GET',
        url: `/v1/listings/${listingId}`,
        headers: { authorization: `Bearer ${apiKey}` },
      });
      const body = res.json();
      expect(body.status).toBe('published');
      expect(body.protocolDocs).toEqual({
        openapiUrl: `/v1/listings/${slug}/openapi.json`,
        docsUrl: `/v1/listings/${slug}/docs`,
        postmanUrl: `/v1/listings/${slug}/postman.json`,
      });
    });

    it('serves the parsed OpenAPI document', async () => {
      const res = await server.inject({ method: 'GET', url: `/v1/listings/${slug}/openapi.json` });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.openapi).toBe('3.0.3');
      expect(body.paths['/wallet-risk'].get.operationId).toBe('getWalletRisk');
      expect(body.servers).toEqual([{ url: 'https://api.ledgerwatch.test/v1' }]);
    });

    it('renders Swagger UI', async () => {
      const res = await server.inject({ method: 'GET', url: `/v1/listings/${slug}/docs` });
      expect(res.statusCode).toBe(200);
      expect(res.headers['content-type']).toContain('text/html');
      expect(res.body).toContain('SwaggerUIBundle');
      expect(res.body).toContain(`/v1/listings/${slug}/openapi.json`);
    });

    it('converts the spec to a Postman collection', async () => {
      const res = await server.inject({ method: 'GET', url: `/v1/listings/${slug}/postman.json` });
      expect(res.statusCode).toBe(200);
      const collection = res.json();
      expect(collection.info.schema).toBe('https://schema.getpostman.com/json/collection/v2.1.0/collection.json');
      expect(collection.item).toHaveLength(1);
      expect(collection.item[0].request.method).toBe('GET');
      expect(collection.item[0].request.url.raw).toContain('/wallet-risk');
      expect(collection.item[0].request.url.query?.[0].key).toBe('address');
    });

    it('appears as an MCP tool in the manifest, with billing metadata attached', async () => {
      const res = await server.inject({ method: 'GET', url: '/.well-known/mcp.json' });
      const manifest = McpManifestSchema.parse(res.json());
      const tool = manifest.tools.find((t) => t.name === `${slug}__getwalletrisk`);
      expect(tool).toBeDefined();
      expect(tool?.agentmarket).toEqual({
        priceUsd: 0.02,
        resource: 'https://api.ledgerwatch.test/v1/wallet-risk',
        method: 'GET',
        isThirdParty: true,
        slug,
      });
      expect(tool?.inputSchema).toEqual({ type: 'object', properties: { address: { type: 'string' } }, required: ['address'] });
    });
  });

  describe('a published listing without a spec', () => {
    const slug = 'no-spec-catalog-test';
    let apiKey: string;

    beforeAll(async () => {
      apiKey = await registerProvider('no-spec-catalog@catalog.test');
      const create = await server.inject({
        method: 'POST',
        url: '/v1/listings',
        headers: { authorization: `Bearer ${apiKey}` },
        payload: {
          slug,
          name: 'No Spec Listing',
          description: 'A perfectly good listing that just never uploaded a spec.',
          category: 'Test',
          upstreamUrl: 'https://api.example.test/v1',
        },
      });
      const listingId = create.json().id;
      await server.inject({ method: 'POST', url: '/v1/providers/verify', headers: { authorization: `Bearer ${apiKey}` } });
      await server.inject({
        method: 'PATCH',
        url: `/v1/listings/${listingId}/pricing`,
        headers: { authorization: `Bearer ${apiKey}` },
        payload: { pricingModel: 'pay_per_call', priceUsd: 0.02 },
      });
      await server.inject({
        method: 'PATCH',
        url: `/v1/listings/${listingId}/payment`,
        headers: { authorization: `Bearer ${apiKey}` },
        payload: { payoutWalletAddress: WALLET },
      });
      await server.inject({ method: 'POST', url: `/v1/listings/${listingId}/publish`, headers: { authorization: `Bearer ${apiKey}` } });
    });

    it('degrades gracefully instead of erroring', async () => {
      const openapi = await server.inject({ method: 'GET', url: `/v1/listings/${slug}/openapi.json` });
      expect(openapi.statusCode).toBe(404);
      expect(openapi.json().error.code).toBe('NOT_FOUND');

      const docs = await server.inject({ method: 'GET', url: `/v1/listings/${slug}/docs` });
      expect(docs.statusCode).toBe(404);
    });

    it('is not present in the MCP manifest', async () => {
      const res = await server.inject({ method: 'GET', url: '/.well-known/mcp.json' });
      const manifest = McpManifestSchema.parse(res.json());
      expect(manifest.tools.some((t) => t.agentmarket.slug === slug)).toBe(false);
    });
  });

  describe('first-party catalog', () => {
    it('generates one OpenAPI document for all 8 first-party endpoints', async () => {
      const res = await server.inject({ method: 'GET', url: '/v1/catalog/openapi.json' });
      expect(res.statusCode).toBe(200);
      const doc = res.json();
      expect(Object.keys(doc.paths)).toEqual(
        expect.arrayContaining([
          '/v1/analyze',
          '/v1/market-summary',
          '/v1/sentiment',
          '/v1/risk-analysis',
          '/v1/technical-summary',
          '/v1/trending-assets',
          '/v1/portfolio-health',
          '/v1/execution-readiness',
        ]),
      );
    });

    it('renders Swagger UI for the first-party catalog', async () => {
      const res = await server.inject({ method: 'GET', url: '/v1/catalog/docs' });
      expect(res.statusCode).toBe(200);
      expect(res.body).toContain('/v1/catalog/openapi.json');
    });

    it('converts the first-party catalog to a Postman collection covering every endpoint', async () => {
      const res = await server.inject({ method: 'GET', url: '/v1/catalog/postman.json' });
      expect(res.statusCode).toBe(200);
      const collection = res.json();
      expect(collection.item).toHaveLength(8);
    });

    it('serves the swagger-ui static assets', async () => {
      const res = await server.inject({ method: 'GET', url: '/v1/_swagger-ui/swagger-ui-bundle.js' });
      expect(res.statusCode).toBe(200);
      expect(res.headers['content-type']).toBe('application/javascript');
    });
  });

  describe('MCP manifest and server', () => {
    it('lists every first-party endpoint as a tool in the discovery manifest', async () => {
      const res = await server.inject({ method: 'GET', url: '/.well-known/mcp.json' });
      expect(res.statusCode).toBe(200);
      const manifest = McpManifestSchema.parse(res.json());
      const firstPartyTools = manifest.tools.filter((t) => !t.agentmarket.isThirdParty);
      expect(firstPartyTools.length).toBe(8);
      expect(firstPartyTools.map((t) => t.agentmarket.resource)).toEqual(
        expect.arrayContaining(['/v1/analyze', '/v1/portfolio-health']),
      );
    });

    it('completes a real MCP initialize handshake', async () => {
      const { statusCode, message } = await mcpRequest(server, {
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'vitest', version: '1.0' } },
      });
      expect(statusCode).toBe(200);
      expect(message.result).toMatchObject({ serverInfo: { name: 'agentmarket' } });
    });

    it('serves tools/list through the real MCP protocol, validated against the SDK\'s own ListToolsResult type', async () => {
      const { statusCode, message } = await mcpRequest(server, { jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} });
      expect(statusCode).toBe(200);

      // The acceptance bar is "valid against the SDK's own types", not just
      // valid JSON — this parses the live response with the SDK's own Zod
      // schema for ListToolsResult.
      const result = ListToolsResultSchema.parse(message.result);
      expect(result.tools.length).toBeGreaterThanOrEqual(8);
      expect(result.tools.map((t) => t.name)).toContain('agentmarket__get_v1_analyze');
    });

    it('returns a helpful JSON-RPC error for an unknown tool call', async () => {
      const { message } = await mcpRequest(server, {
        jsonrpc: '2.0',
        id: 3,
        method: 'tools/call',
        params: { name: 'does-not-exist', arguments: {} },
      });
      expect(message.error).toMatchObject({ code: -32601 });
    });

    it('tells the caller how to invoke a real tool directly instead of proxying it', async () => {
      const { message } = await mcpRequest(server, {
        jsonrpc: '2.0',
        id: 4,
        method: 'tools/call',
        params: { name: 'agentmarket__get_v1_analyze', arguments: { symbol: 'BTC' } },
      });
      const result = message.result as { isError: boolean; content: { type: string; text: string }[] };
      expect(result.isError).toBe(true);
      expect(result.content[0]?.text).toContain('GET /v1/analyze');
    });
  });
});
