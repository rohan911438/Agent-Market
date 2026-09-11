import type { McpToolMetadata } from '@rohankumar4179/shared-types';
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

/**
 * Every catalog tool's input schema carries this reserved, namespaced block
 * alongside the operation's real parameters — namespaced under a single
 * `_agentmarket` object (not flat reserved keys) so it can never collide
 * with a real parameter name a first- or third-party operation happens to
 * declare (e.g. a listing with its own "payment" field). This is the
 * machine-readable surface an MCP client uses to complete the x402 dance
 * and declare a budget — see services/mcp-tool-executor.ts and
 * services/mcp-session-budget.ts, which read exactly these fields back out.
 */
const AGENTMARKET_CONTROL_SCHEMA = {
  type: 'object',
  description:
    'Reserved AgentMarket control fields. Not part of the underlying API — read by the MCP tool executor, ' +
    'never forwarded to the endpoint itself.',
  properties: {
    payment: {
      type: 'string',
      description:
        'Base64 X-PAYMENT payload from a prior 402 response to this same tool, once signed. Omit on the first ' +
        'call to a paid tool — the result will report PAYMENT_REQUIRED with everything needed to construct this.',
    },
    sessionId: {
      type: 'string',
      description:
        'A client-chosen id reused across calls to scope maxSessionSpendUsd/maxDailySpendUsd tracking to one ' +
        'agent session. Omit for stateless, per-call-only budget enforcement.',
    },
    maxCostUsd: {
      type: 'number',
      description: "Reject this call with BUDGET_EXCEEDED before paying if the tool's price exceeds this.",
    },
    maxSessionSpendUsd: {
      type: 'number',
      description: 'Sets/updates the sessionId\'s cumulative spend cap for this MCP connection. Requires sessionId.',
    },
    maxDailySpendUsd: {
      type: 'number',
      description: "Sets/updates the sessionId's cumulative spend cap for the current UTC day. Requires sessionId.",
    },
  },
} as const;

function operationToInputSchema(operation: OpenApiOperation): CatalogTool['inputSchema'] {
  const properties: Record<string, unknown> = { _agentmarket: AGENTMARKET_CONTROL_SCHEMA };
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
        operationId: operation.operationId,
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
          operationId: operation.operationId,
        },
      });
    }
  }

  return tools;
}

/**
 * The one built-in tool that isn't derived from a listing's OpenAPI
 * operation — Phase 9's ranked discovery (services/discovery-ranking.ts, via
 * routes/discover.route.ts's exported `runDiscovery`), exposed as an MCP
 * tool so an agent can search by capability ("low-latency crypto sentiment")
 * without first fetching the whole catalog. Free — no `_agentmarket`
 * payment/budget fields apply, so its schema omits them rather than
 * advertising controls that do nothing.
 */
export function buildDiscoverCapabilitiesTool(): CatalogTool {
  return {
    name: 'discover_capabilities',
    description:
      'Ranks every marketplace capability (first- and third-party) against a free-text description of what you ' +
      'need, optionally constrained by cost/latency. Use this instead of tools/list when you know the job but not ' +
      'which listing does it.',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'What you need, e.g. "low-latency BTC risk assessment".' },
        maxCostPerCall: { type: 'number', description: 'Hard ceiling — listings priced above this are excluded entirely.' },
        maxLatencyMs: { type: 'number', description: 'Soft preference — listings slower than this (p95) are down-ranked, not excluded.' },
      },
      required: ['query'],
    },
    agentmarket: { priceUsd: null, resource: '/v1/discover', method: 'POST', isThirdParty: false },
  };
}
