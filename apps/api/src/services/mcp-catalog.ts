import type { McpToolMetadata } from '@agentmarket/shared-types';
import type { AppContext } from '../context.js';
import { extractOperations, type OpenApiOperation } from './openapi-spec.js';
import { FIRST_PARTY_ENDPOINTS, getFirstPartyOpenApiDocument } from './first-party-openapi.js';

export interface CatalogTool {
  name: string;
  description: string;
  inputSchema: { type: 'object'; properties: Record<string, unknown>; required?: string[] };
  agentmarket: McpToolMetadata;
}

function toToolName(namespace: string, operationId: string): string {
  return `${namespace}__${operationId}`.toLowerCase().replace(/[^a-z0-9_-]/g, '_');
}

function operationToInputSchema(operation: OpenApiOperation): CatalogTool['inputSchema'] {
  const properties: Record<string, unknown> = {};
  const required: string[] = [];

  for (const param of operation.parameters) {
    if (param.in !== 'query' && param.in !== 'path') continue; // headers/cookies aren't agent-supplied tool args
    properties[param.name] = param.schema ?? { type: 'string' };
    if (param.required) required.push(param.name);
  }

  const bodySchema = operation.requestBodySchema;
  if (bodySchema && bodySchema.type === 'object' && typeof bodySchema.properties === 'object') {
    Object.assign(properties, bodySchema.properties as Record<string, unknown>);
    if (Array.isArray(bodySchema.required)) required.push(...(bodySchema.required as string[]));
  }

  return { type: 'object', properties, required: required.length > 0 ? required : undefined };
}

/**
 * Every published listing — first- and third-party — flattened into one
 * MCP tool per OpenAPI operation. Mirrors marketplace.route.ts's "one read
 * model for both" principle: an MCP client sees the same catalog the
 * marketplace page does, just shaped as tools instead of listing cards.
 */
export async function buildCatalogTools(ctx: AppContext): Promise<CatalogTool[]> {
  const tools: CatalogTool[] = [];

  const firstPartyDoc = getFirstPartyOpenApiDocument();
  for (const operation of extractOperations(firstPartyDoc as unknown as Record<string, unknown>)) {
    const endpoint = FIRST_PARTY_ENDPOINTS.find((e) => e.path === operation.path && e.method === operation.method);
    tools.push({
      name: toToolName('agentmarket', operation.operationId),
      description: operation.summary ?? operation.description ?? `${operation.method.toUpperCase()} ${operation.path}`,
      inputSchema: operationToInputSchema(operation),
      agentmarket: {
        priceUsd: endpoint?.priceUsd ?? null,
        resource: endpoint?.resource ?? operation.path,
        method: operation.method.toUpperCase() as McpToolMetadata['method'],
        isThirdParty: false,
      },
    });
  }

  const published = await ctx.db.apiListings.listPublished();
  for (const listing of published) {
    if (!listing.parsedOpenApiSpec) continue;

    let document: Record<string, unknown>;
    try {
      document = JSON.parse(listing.parsedOpenApiSpec) as Record<string, unknown>;
    } catch {
      continue; // defensive — parsedOpenApiSpec is only ever written by parseOpenApiSpec's validated output
    }

    for (const operation of extractOperations(document)) {
      tools.push({
        name: toToolName(listing.slug, operation.operationId),
        description:
          operation.summary ?? operation.description ?? `${listing.name}: ${operation.method.toUpperCase()} ${operation.path}`,
        inputSchema: operationToInputSchema(operation),
        agentmarket: {
          priceUsd: listing.priceUsd,
          resource: `${listing.upstreamUrl}${operation.path}`,
          method: operation.method.toUpperCase() as McpToolMetadata['method'],
          isThirdParty: true,
          slug: listing.slug,
        },
      });
    }
  }

  return tools;
}
