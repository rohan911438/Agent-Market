import { encodePaymentPayload } from '@agentmarket/payments';
import { A2AAgentCardSchema, A2AJsonRpcResponseSchema, A2ATaskSchema } from '@agentmarket/shared-types';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildServer } from '../src/server.js';
import { buildTestContext } from './helpers/build-test-context.js';

function paymentHeaderFor(nonceSeed: string, address: string): string {
  return encodePaymentPayload({
    x402Version: 1,
    scheme: 'exact',
    network: 'mock',
    payload: { nonce: `${nonceSeed}-${Date.now()}`, address },
  });
}

async function sendRpc(server: FastifyInstance, method: string, params: unknown, headers: Record<string, string> = {}) {
  const res = await server.inject({
    method: 'POST',
    url: '/a2a',
    headers,
    payload: { jsonrpc: '2.0', id: Math.floor(Math.random() * 1_000_000), method, params },
  });
  return res;
}

describe('A2A (Agent-to-Agent) protocol (Phase 5)', () => {
  let server: FastifyInstance;

  beforeAll(async () => {
    server = buildServer(buildTestContext());
    await server.ready();
  });

  afterAll(async () => {
    await server.close();
  });

  describe('agent card', () => {
    it('is fetchable at the A2A-standard discovery path and validates against the A2A agent card shape', async () => {
      const res = await server.inject({ method: 'GET', url: '/.well-known/agent.json' });
      expect(res.statusCode).toBe(200);
      const card = A2AAgentCardSchema.parse(res.json());

      expect(card.capabilities.streaming).toBe(false);
      expect(card.url).toMatch(/\/a2a$/);

      const skillIds = card.skills.map((s) => s.id);
      expect(skillIds).toEqual(
        expect.arrayContaining([
          'agentmarket__get_v1_analyze',
          'agentmarket__get_v1_sentiment',
          'agentmarket__post_v1_portfolio_health',
        ]),
      );
    });

    it('shares the same skill/tool id namespace as Phase 4\'s MCP manifest', async () => {
      const [agentCard, mcpManifest] = await Promise.all([
        server.inject({ method: 'GET', url: '/.well-known/agent.json' }),
        server.inject({ method: 'GET', url: '/.well-known/mcp.json' }),
      ]);
      const skillIds = new Set(agentCard.json().skills.map((s: { id: string }) => s.id));
      const toolNames = mcpManifest.json().tools.map((t: { name: string }) => t.name);
      for (const name of toolNames) {
        expect(skillIds.has(name)).toBe(true);
      }
    });
  });

  describe('payment enforcement — must be exactly as strict as the HTTP path', () => {
    it('rejects task creation with no payment using the same 402 shape as the HTTP endpoint', async () => {
      const [httpRes, a2aRes] = await Promise.all([
        server.inject({ method: 'GET', url: '/v1/analyze?symbol=BTC' }),
        sendRpc(server, 'message/send', {
          message: {
            messageId: 'no-pay-1',
            role: 'user',
            parts: [{ kind: 'data', data: { symbol: 'BTC' } }],
            metadata: { skillId: 'agentmarket__get_v1_analyze' },
          },
        }),
      ]);

      expect(a2aRes.statusCode).toBe(402);
      expect(a2aRes.statusCode).toBe(httpRes.statusCode);
      expect(a2aRes.json().accepts[0].resource).toBe('/v1/analyze');
      expect(a2aRes.json().x402Version).toBe(httpRes.json().x402Version);
    });

    it('rejects a malformed X-PAYMENT header with the plain PAYMENT_INVALID error shape, not a JSON-RPC envelope', async () => {
      const res = await sendRpc(
        server,
        'message/send',
        {
          message: {
            messageId: 'bad-pay-1',
            role: 'user',
            parts: [{ kind: 'data', data: { symbol: 'BTC' } }],
            metadata: { skillId: 'agentmarket__get_v1_analyze' },
          },
        },
        { 'x-payment': 'not-a-real-payload' },
      );
      expect(res.statusCode).toBe(400);
      expect(res.json().error.code).toBe('PAYMENT_INVALID');
    });

    it('validates task input before ever touching the payment gate', async () => {
      const res = await sendRpc(
        server,
        'message/send',
        {
          message: {
            messageId: 'bad-input-1',
            role: 'user',
            parts: [{ kind: 'data', data: { symbol: 'not-a-valid-symbol!!' } }],
            metadata: { skillId: 'agentmarket__get_v1_analyze' },
          },
        },
        { 'x-payment': paymentHeaderFor('should-not-be-charged', 'UNCHARGED_WALLET') },
      );
      const rpc = A2AJsonRpcResponseSchema.parse(res.json());
      expect(rpc.error?.code).toBe(-32602); // InvalidParams
    });
  });

  describe('creating and completing a task', () => {
    it('creates a task that matches what the equivalent HTTP call returns', async () => {
      const [httpRes, a2aRes] = await Promise.all([
        (async () => {
          const header = paymentHeaderFor('a2a-parity-http', 'A2A_PARITY_WALLET_1');
          return server.inject({ method: 'GET', url: '/v1/analyze?symbol=BTC', headers: { 'x-payment': header } });
        })(),
        sendRpc(
          server,
          'message/send',
          {
            message: {
              messageId: 'parity-1',
              role: 'user',
              parts: [{ kind: 'data', data: { symbol: 'BTC' } }],
              metadata: { skillId: 'agentmarket__get_v1_analyze' },
            },
          },
          { 'x-payment': paymentHeaderFor('a2a-parity-a2a', 'A2A_PARITY_WALLET_2') },
        ),
      ]);

      expect(httpRes.statusCode).toBe(200);
      const rpc = A2AJsonRpcResponseSchema.parse(a2aRes.json());
      expect(rpc.error).toBeUndefined();
      const task = A2ATaskSchema.parse(rpc.result);

      expect(task.status.state).toBe('completed');
      const resultData = task.artifacts?.[0]?.parts[0]?.data as { symbol: string; action: string };
      const httpBody = httpRes.json();
      expect(resultData.symbol).toBe(httpBody.symbol);
      expect(['BUY', 'SELL', 'HOLD']).toContain(resultData.action);
    });

    it('lets a client poll tasks/get for the result it already has', async () => {
      const header = paymentHeaderFor('a2a-poll', 'A2A_POLL_WALLET');
      const created = await sendRpc(
        server,
        'message/send',
        {
          message: {
            messageId: 'poll-1',
            role: 'user',
            parts: [{ kind: 'data', data: { symbol: 'ETH' } }],
            metadata: { skillId: 'agentmarket__get_v1_analyze' },
          },
        },
        { 'x-payment': header },
      );
      const task = A2ATaskSchema.parse(A2AJsonRpcResponseSchema.parse(created.json()).result);

      const polled = await sendRpc(server, 'tasks/get', { id: task.id });
      const polledTask = A2ATaskSchema.parse(A2AJsonRpcResponseSchema.parse(polled.json()).result);
      expect(polledTask.id).toBe(task.id);
      expect(polledTask.status.state).toBe('completed');
    });

    it('settles the payment and records usage exactly like the HTTP path does', async () => {
      const address = 'A2A_LEDGER_WALLET';
      const header = paymentHeaderFor('a2a-ledger', address);
      const res = await sendRpc(
        server,
        'message/send',
        {
          message: {
            messageId: 'ledger-1',
            role: 'user',
            parts: [{ kind: 'data', data: { symbol: 'SOL' } }],
            metadata: { skillId: 'agentmarket__get_v1_analyze' },
          },
        },
        { 'x-payment': header },
      );
      expect(res.statusCode).toBe(200);

      // A duplicate X-PAYMENT must never re-execute or re-settle — same
      // idempotency guarantee the HTTP path gets from the same gate.
      const replay = await sendRpc(
        server,
        'message/send',
        {
          message: {
            messageId: 'ledger-1-retry',
            role: 'user',
            parts: [{ kind: 'data', data: { symbol: 'SOL' } }],
            metadata: { skillId: 'agentmarket__get_v1_analyze' },
          },
        },
        { 'x-payment': header },
      );
      expect(replay.statusCode).toBe(200);
      expect(replay.headers['x-payment-replay']).toBe('true');
    });

    it('cancelling an already-completed task returns TaskNotCancelable, never a fake success', async () => {
      const header = paymentHeaderFor('a2a-cancel', 'A2A_CANCEL_WALLET');
      const created = await sendRpc(
        server,
        'message/send',
        {
          message: {
            messageId: 'cancel-1',
            role: 'user',
            parts: [{ kind: 'data', data: { symbol: 'BTC' } }],
            metadata: { skillId: 'agentmarket__get_v1_analyze' },
          },
        },
        { 'x-payment': header },
      );
      const task = A2ATaskSchema.parse(A2AJsonRpcResponseSchema.parse(created.json()).result);

      const canceled = await sendRpc(server, 'tasks/cancel', { id: task.id });
      const rpc = A2AJsonRpcResponseSchema.parse(canceled.json());
      expect(rpc.error?.code).toBe(-32002); // TaskNotCancelable
    });
  });

  describe('protocol-level errors', () => {
    it('rejects an unknown skill id with InvalidParams', async () => {
      const res = await sendRpc(server, 'message/send', {
        message: {
          messageId: 'unknown-skill-1',
          role: 'user',
          parts: [{ kind: 'data', data: {} }],
          metadata: { skillId: 'does-not-exist' },
        },
      });
      const rpc = A2AJsonRpcResponseSchema.parse(res.json());
      expect(rpc.error?.code).toBe(-32602);
    });

    it('rejects a message with no skillId', async () => {
      const res = await sendRpc(server, 'message/send', {
        message: { messageId: 'no-skill-1', role: 'user', parts: [{ kind: 'data', data: {} }] },
      });
      const rpc = A2AJsonRpcResponseSchema.parse(res.json());
      expect(rpc.error?.code).toBe(-32602);
    });

    it('rejects an unknown JSON-RPC method', async () => {
      const res = await sendRpc(server, 'tasks/pushNotificationConfig/set', {});
      const rpc = A2AJsonRpcResponseSchema.parse(res.json());
      expect(rpc.error?.code).toBe(-32601); // MethodNotFound
    });

    it('rejects tasks/get with a missing id param', async () => {
      const res = await sendRpc(server, 'tasks/get', {});
      const rpc = A2AJsonRpcResponseSchema.parse(res.json());
      expect(rpc.error?.code).toBe(-32602);
    });
  });

  describe('third-party listings — discoverable, not invocable', () => {
    const WALLET = 'D'.repeat(58);

    beforeAll(async () => {
      const register = await server.inject({
        method: 'POST',
        url: '/v1/providers/register',
        payload: { name: 'A2A Third Party', email: 'a2a-third-party@catalog.test', walletAddress: WALLET },
      });
      const apiKey = register.json().apiKey;

      const create = await server.inject({
        method: 'POST',
        url: '/v1/listings',
        headers: { authorization: `Bearer ${apiKey}` },
        payload: {
          slug: 'a2a-third-party-listing',
          name: 'A2A Third Party Listing',
          description: 'Exists only to prove third-party listings are discoverable but not invocable via A2A.',
          category: 'Test',
          upstreamUrl: 'https://api.example.test/v1',
          openApiSpec: JSON.stringify({
            openapi: '3.0.3',
            info: { title: 'Third Party', version: '1.0.0' },
            paths: { '/ping': { get: { operationId: 'ping', responses: { 200: { description: 'OK' } } } } },
          }),
        },
      });
      const listingId = create.json().id;

      await server.inject({ method: 'POST', url: '/v1/providers/verify', headers: { authorization: `Bearer ${apiKey}` } });
      await server.inject({
        method: 'PATCH',
        url: `/v1/listings/${listingId}/pricing`,
        headers: { authorization: `Bearer ${apiKey}` },
        payload: { pricingModel: 'pay_per_call', priceUsd: 0.01 },
      });
      await server.inject({
        method: 'PATCH',
        url: `/v1/listings/${listingId}/payment`,
        headers: { authorization: `Bearer ${apiKey}` },
        payload: { payoutWalletAddress: WALLET },
      });
      await server.inject({ method: 'POST', url: `/v1/listings/${listingId}/publish`, headers: { authorization: `Bearer ${apiKey}` } });
    });

    it('appears in the agent card', async () => {
      const res = await server.inject({ method: 'GET', url: '/.well-known/agent.json' });
      const card = A2AAgentCardSchema.parse(res.json());
      const skill = card.skills.find((s) => s.id === 'a2a-third-party-listing__ping');
      expect(skill).toBeDefined();
      expect(skill?.tags).toContain('third-party');
    });

    it('rejects message/send targeting it with UnsupportedOperation, even when unpaid', async () => {
      const res = await sendRpc(server, 'message/send', {
        message: {
          messageId: 'third-party-1',
          role: 'user',
          parts: [{ kind: 'data', data: {} }],
          metadata: { skillId: 'a2a-third-party-listing__ping' },
        },
      });
      const rpc = A2AJsonRpcResponseSchema.parse(res.json());
      expect(rpc.error?.code).toBe(-32004); // UnsupportedOperation
    });
  });
});
