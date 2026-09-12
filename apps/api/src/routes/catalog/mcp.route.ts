import type { McpManifest } from '@rohankumar4179/shared-types';
import { Server } from '@modelcontextprotocol/sdk/server';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import {
  CallToolRequestSchema,
  ErrorCode,
  GetPromptRequestSchema,
  ListPromptsRequestSchema,
  ListResourcesRequestSchema,
  ListToolsRequestSchema,
  McpError,
  ReadResourceRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { AppContext } from '../../context.js';
import { runDiscovery } from '../discover.route.js';
import { buildCatalogTools, buildDiscoverCapabilitiesTool } from '../../services/mcp-catalog.js';
import { executeCatalogTool, type McpToolResult } from '../../services/mcp-tool-executor.js';
import { MCP_PROMPTS, renderMcpPrompt } from '../../services/mcp-prompts.js';
import { MCP_RESOURCE_DESCRIPTORS, readMcpResource } from '../../services/mcp-resources.js';
import { originOf } from './origin.js';

const MCP_PROTOCOL_VERSION = '2025-06-18';

async function callDiscoverCapabilities(ctx: AppContext, args: Record<string, unknown>): Promise<McpToolResult> {
  const query = typeof args.query === 'string' ? args.query.trim() : '';
  if (!query) {
    return {
      isError: true,
      content: [{ type: 'text', text: JSON.stringify({ code: 'INVALID_ARGUMENT', message: '"query" is required.' }) }],
    };
  }
  const constraints: { maxLatencyMs?: number; maxCostPerCall?: number } = {};
  if (typeof args.maxLatencyMs === 'number') constraints.maxLatencyMs = args.maxLatencyMs;
  if (typeof args.maxCostPerCall === 'number') constraints.maxCostPerCall = args.maxCostPerCall;

  const response = await runDiscovery(ctx, { task: query, constraints: Object.keys(constraints).length > 0 ? constraints : undefined });
  return {
    isError: false,
    content: [{ type: 'text', text: JSON.stringify(response) }],
    structuredContent: response as unknown as Record<string, unknown>,
  };
}

/**
 * AgentMarket's agent-native interface: every capability this platform
 * sells — first-party financial intelligence and every published
 * third-party listing — reachable as MCP tools, resources, and prompts. As
 * of this phase, `tools/call` actually executes: it injects a real request
 * into the same real, unmodified x402-metered REST route the capability
 * already has (services/mcp-tool-executor.ts) — payment verification,
 * settlement, replay protection, rate limiting, caching, and audit logging
 * all run exactly as they do for a direct HTTP caller, because that's what
 * this is, just issued in-process. Nothing about the payment gate
 * (middleware/x402-payment.ts) changed to make this possible.
 */
export function registerMcpRoutes(server: FastifyInstance, ctx: AppContext): void {
  // Plain-JSON discovery manifest — for tooling that wants to `fetch()` the
  // catalog without speaking MCP's JSON-RPC transport at all.
  server.get('/.well-known/mcp.json', async (request) => {
    const tools = [...(await buildCatalogTools(ctx)), buildDiscoverCapabilitiesTool()];
    const manifest: McpManifest = {
      mcpVersion: MCP_PROTOCOL_VERSION,
      name: 'agentmarket',
      description: 'AgentMarket catalog — first-party intelligence endpoints plus every published third-party listing.',
      endpoint: `${originOf(request)}/mcp`,
      tools: tools.map((tool) => ({
        name: tool.name,
        description: tool.description,
        inputSchema: tool.inputSchema,
        agentmarket: tool.agentmarket,
      })),
    };
    return manifest;
  });

  // A real MCP server (Streamable HTTP transport) a client can connect to —
  // Claude Desktop, Cursor, Windsurf, VS Code, or the MCP Inspector CLI.
  // Stateless (sessionIdGenerator: undefined): a fresh Server+transport pair
  // per request, torn down when the connection closes — the recommended
  // pattern for stateless mode, and it avoids any cross-request state
  // bleeding through a long-lived shared transport. Budget/session state
  // (Phase 11) is deliberately NOT built on top of this transport's own
  // session concept — see services/mcp-session-budget.ts's docstring for why
  // it's keyed by the caller's own `_agentmarket.sessionId` argument instead.
  function createMcpServer(callerRequest: FastifyRequest): Server {
    const mcpServer = new Server(
      { name: 'agentmarket', version: '1.0.0' },
      { capabilities: { tools: {}, resources: {}, prompts: {} } },
    );

    mcpServer.setRequestHandler(ListToolsRequestSchema, async () => {
      const tools = [...(await buildCatalogTools(ctx)), buildDiscoverCapabilitiesTool()];
      return {
        tools: tools.map((tool) => ({
          name: tool.name,
          description: tool.description,
          inputSchema: tool.inputSchema,
          _meta: { agentmarket: tool.agentmarket },
        })),
      };
    });

    mcpServer.setRequestHandler(CallToolRequestSchema, async (request) => {
      const args = (request.params.arguments ?? {}) as Record<string, unknown>;

      if (request.params.name === 'discover_capabilities') {
        return callDiscoverCapabilities(ctx, args);
      }

      const tools = await buildCatalogTools(ctx);
      if (!tools.some((t) => t.name === request.params.name)) {
        throw new McpError(ErrorCode.MethodNotFound, `Unknown tool "${request.params.name}"`);
      }
      return executeCatalogTool(ctx, server, request.params.name, args, callerRequest);
    });

    mcpServer.setRequestHandler(ListResourcesRequestSchema, async () => ({ resources: MCP_RESOURCE_DESCRIPTORS }));

    mcpServer.setRequestHandler(ReadResourceRequestSchema, async (request) => {
      const contents = await readMcpResource(ctx, request.params.uri);
      return { contents: [contents] };
    });

    mcpServer.setRequestHandler(ListPromptsRequestSchema, async () => ({
      prompts: MCP_PROMPTS.map((p) => ({ name: p.name, description: p.description, arguments: p.arguments })),
    }));

    mcpServer.setRequestHandler(GetPromptRequestSchema, async (request) => {
      try {
        const text = renderMcpPrompt(request.params.name, request.params.arguments ?? {});
        return { messages: [{ role: 'user' as const, content: { type: 'text' as const, text } }] };
      } catch (err) {
        throw new McpError(ErrorCode.InvalidParams, err instanceof Error ? err.message : 'Invalid prompt request.');
      }
    });

    return mcpServer;
  }

  server.route({
    method: ['GET', 'POST', 'DELETE'],
    url: '/mcp',
    handler: async (request, reply) => {
      const mcpServer = createMcpServer(request);
      const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
      reply.raw.on('close', () => {
        void transport.close();
        void mcpServer.close();
      });
      await mcpServer.connect(transport);
      reply.hijack();
      await transport.handleRequest(request.raw, reply.raw, request.body);
    },
  });
}
