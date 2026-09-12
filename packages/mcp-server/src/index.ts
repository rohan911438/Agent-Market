#!/usr/bin/env node
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  GetPromptRequestSchema,
  ListPromptsRequestSchema,
  ListResourcesRequestSchema,
  ListToolsRequestSchema,
  ReadResourceRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';

const DEFAULT_REMOTE_URL = 'https://agentmarket-api-bedc.onrender.com/mcp';
const remoteUrl = process.env.AGENTMARKET_MCP_URL?.trim() || DEFAULT_REMOTE_URL;

/**
 * Thin stdio<->Streamable HTTP bridge: Claude Desktop/Cursor/Windsurf only
 * speak MCP over stdio to a locally-spawned process, but AgentMarket's real
 * MCP server (apps/api's `/mcp` route) is a remote Streamable HTTP endpoint.
 * This process forwards every request verbatim to that endpoint — no tool
 * catalog, payment logic, or business rules are duplicated here.
 */
async function main(): Promise<void> {
  const remoteClient = new Client({ name: 'agentmarket-mcp-bridge', version: '0.1.0' }, { capabilities: {} });
  const remoteTransport = new StreamableHTTPClientTransport(new URL(remoteUrl));
  await remoteClient.connect(remoteTransport);

  const localServer = new Server(
    { name: 'agentmarket', version: '0.1.0' },
    { capabilities: { tools: {}, resources: {}, prompts: {} } },
  );

  localServer.setRequestHandler(ListToolsRequestSchema, (request) => remoteClient.listTools(request.params));
  localServer.setRequestHandler(CallToolRequestSchema, (request) => remoteClient.callTool(request.params));
  localServer.setRequestHandler(ListResourcesRequestSchema, (request) => remoteClient.listResources(request.params));
  localServer.setRequestHandler(ReadResourceRequestSchema, (request) => remoteClient.readResource(request.params));
  localServer.setRequestHandler(ListPromptsRequestSchema, (request) => remoteClient.listPrompts(request.params));
  localServer.setRequestHandler(GetPromptRequestSchema, (request) => remoteClient.getPrompt(request.params));

  const localTransport = new StdioServerTransport();
  await localServer.connect(localTransport);

  process.stderr.write(`agentmarket-mcp: bridging stdio -> ${remoteUrl}\n`);

  const shutdown = async (): Promise<void> => {
    await localServer.close();
    await remoteClient.close();
    process.exit(0);
  };
  process.on('SIGINT', () => void shutdown());
  process.on('SIGTERM', () => void shutdown());
}

main().catch((err: unknown) => {
  process.stderr.write(`agentmarket-mcp: fatal error: ${err instanceof Error ? err.stack ?? err.message : String(err)}\n`);
  process.exit(1);
});
