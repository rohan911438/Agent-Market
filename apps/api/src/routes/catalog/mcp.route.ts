import type { McpManifest } from '@rohankumar4179/shared-types';
import { Server } from '@modelcontextprotocol/sdk/server';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { CallToolRequestSchema, ErrorCode, ListToolsRequestSchema, McpError } from '@modelcontextprotocol/sdk/types.js';
import type { FastifyInstance } from 'fastify';
import type { AppContext } from '../../context.js';
import { buildCatalogTools } from '../../services/mcp-catalog.js';
import { originOf } from './origin.js';

const MCP_PROTOCOL_VERSION = '2025-06-18';

/**
 * Discovery-only, per Phase 4's explicit decision: an HTTP manifest plus a
 * real connectable MCP server are both built here (tools/list works fully),
 * but tools/call never proxies through to an upstream — that's gateway
 * infrastructure phase 4 doesn't build (see the "Not in scope" section).
 * Calling a tool returns a pointer back to the metered REST endpoint
 * instead of failing opaquely.
 */
export function registerMcpRoutes(server: FastifyInstance, ctx: AppContext): void {
  // Plain-JSON discovery manifest — for tooling that wants to `fetch()` the
  // catalog without speaking MCP's JSON-RPC transport at all.
  server.get('/.well-known/mcp.json', async (request) => {
    const tools = await buildCatalogTools(ctx);
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
  // bleeding through a long-lived shared transport.
  function createMcpServer(): Server {
    const mcpServer = new Server({ name: 'agentmarket', version: '1.0.0' }, { capabilities: { tools: {} } });

    mcpServer.setRequestHandler(ListToolsRequestSchema, async () => {
      const tools = await buildCatalogTools(ctx);
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
      const tools = await buildCatalogTools(ctx);
      const tool = tools.find((t) => t.name === request.params.name);
      if (!tool) {
        throw new McpError(ErrorCode.MethodNotFound, `Unknown tool "${request.params.name}"`);
      }

      const price = tool.agentmarket.priceUsd != null ? `$${tool.agentmarket.priceUsd.toFixed(2)}/call, x402-metered` : 'free';
      return {
        isError: true,
        content: [
          {
            type: 'text',
            text:
              `AgentMarket's MCP server is discovery-only in this phase — it doesn't proxy tool calls yet. ` +
              `Call this endpoint directly instead: ${tool.agentmarket.method} ${tool.agentmarket.resource} (${price}). ` +
              `See @rohankumar4179/agent-sdk for a client that handles the x402 payment handshake automatically.`,
          },
        ],
      };
    });

    return mcpServer;
  }

  server.route({
    method: ['GET', 'POST', 'DELETE'],
    url: '/mcp',
    handler: async (request, reply) => {
      const mcpServer = createMcpServer();
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
