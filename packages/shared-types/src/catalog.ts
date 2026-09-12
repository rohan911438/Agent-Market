import { z } from 'zod';

/**
 * Links to the protocol-native artifacts generated from a listing's OpenAPI
 * spec (Phase 4). Null whenever the listing has no spec on file yet — the
 * catalog degrades gracefully instead of treating openApiSpec as required.
 */
export const CatalogDocsLinksSchema = z.object({
  openapiUrl: z.string(),
  docsUrl: z.string(),
  postmanUrl: z.string(),
});
export type CatalogDocsLinks = z.infer<typeof CatalogDocsLinksSchema>;

export const McpToolMetadataSchema = z.object({
  priceUsd: z.number().nullable(),
  resource: z.string(),
  method: z.enum(['GET', 'POST', 'PUT', 'PATCH', 'DELETE']),
  isThirdParty: z.boolean(),
  slug: z.string().optional(),
  /** The OpenAPI operationId this tool was flattened from — needed to re-select the same operation when actually invoking a third-party listing (see services/listing-invocation.ts). Always present; kept optional for backward compatibility with any manifest snapshot recorded before this field existed. */
  operationId: z.string().optional(),
});
export type McpToolMetadata = z.infer<typeof McpToolMetadataSchema>;

/**
 * Our own convenience shape for `/.well-known/mcp.json` — a plain-JSON,
 * fetch-and-read manifest for discovery tooling that doesn't want to speak
 * the full MCP JSON-RPC protocol. The `name`/`description`/`inputSchema`
 * fields line up with `@modelcontextprotocol/sdk`'s `Tool` type; the real
 * MCP server (`/mcp`) returns the SDK's own `Tool` objects directly, this is
 * a superset carrying our billing metadata alongside.
 */
export const McpManifestToolSchema = z.object({
  name: z.string(),
  description: z.string(),
  inputSchema: z.record(z.string(), z.unknown()),
  agentmarket: McpToolMetadataSchema,
});
export type McpManifestTool = z.infer<typeof McpManifestToolSchema>;

export const McpManifestSchema = z.object({
  mcpVersion: z.string(),
  name: z.string(),
  description: z.string(),
  endpoint: z.string(),
  tools: z.array(McpManifestToolSchema),
});
export type McpManifest = z.infer<typeof McpManifestSchema>;
