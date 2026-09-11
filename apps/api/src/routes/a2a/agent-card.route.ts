import type { A2AAgentCard } from '@rohankumar4179/shared-types';
import type { FastifyInstance } from 'fastify';
import type { AppContext } from '../../context.js';
import { buildCatalogTools } from '../../services/mcp-catalog.js';
import { originOf } from '../catalog/origin.js';

/**
 * `/.well-known/agent.json` — the A2A discovery path. Skills are built from
 * Phase 4's `buildCatalogTools()` rather than re-described by hand: a
 * skill's `id` is identical to its Phase 4 MCP tool name, so the two
 * discovery protocols share one identifier space for the same capability.
 * Third-party listings appear here too (discoverable) even though
 * `message/send` can't invoke them yet — same gateway caveat as Phase 4's
 * MCP manifest.
 */
export function registerAgentCardRoute(server: FastifyInstance, ctx: AppContext): void {
  server.get('/.well-known/agent.json', async (request) => {
    const tools = await buildCatalogTools(ctx);
    const origin = originOf(request);

    const card: A2AAgentCard = {
      name: 'agentmarket',
      description:
        'AgentMarket — x402-metered market intelligence. First-party skills are directly callable as A2A tasks; ' +
        'third-party listings are discoverable but not yet invocable (no gateway to their upstream).',
      url: `${origin}/a2a`,
      version: '1.0.0',
      capabilities: { streaming: false, pushNotifications: false, stateTransitionHistory: false },
      defaultInputModes: ['application/json'],
      defaultOutputModes: ['application/json'],
      skills: tools.map((tool) => ({
        id: tool.name,
        name: tool.name,
        description: tool.agentmarket.isThirdParty
          ? `${tool.description} (third-party listing — discoverable only; message/send returns UnsupportedOperation until a gateway exists)`
          : tool.description,
        tags: [
          tool.agentmarket.isThirdParty ? 'third-party' : 'first-party',
          tool.agentmarket.method.toLowerCase(),
          ...(tool.agentmarket.slug ? [tool.agentmarket.slug] : []),
        ],
        inputModes: ['application/json'],
        outputModes: ['application/json'],
        metadata: { inputSchema: tool.inputSchema, agentmarket: tool.agentmarket },
      })),
    };

    return card;
  });
}
