import type { FastifyInstance } from 'fastify';
import type { AppContext } from '../../context.js';
import { getFirstPartyOpenApiDocument } from '../../services/first-party-openapi.js';
import { buildPostmanCollection } from '../../services/postman-collection.js';
import { originOf } from './origin.js';
import { renderSwaggerUiHtml } from './swagger-ui.js';

/**
 * Protocol-native artifacts for the 8 first-party endpoints — generated
 * from the same Zod schemas the routes validate against
 * (services/first-party-openapi.ts), so this can never drift the way 8
 * hand-authored YAML files would.
 */
export function registerFirstPartyCatalogRoutes(server: FastifyInstance, _ctx: AppContext): void {
  server.get('/v1/catalog/openapi.json', async (request) => {
    const document = getFirstPartyOpenApiDocument();
    return { ...document, servers: [{ url: originOf(request) }] };
  });

  server.get('/v1/catalog/docs', async (_request, reply) => {
    reply.header('content-type', 'text/html; charset=utf-8');
    return renderSwaggerUiHtml('AgentMarket — First-Party API Docs', '/v1/catalog/openapi.json');
  });

  server.get('/v1/catalog/postman.json', async (request, reply) => {
    const document = getFirstPartyOpenApiDocument();
    const collection = buildPostmanCollection(document as unknown as Record<string, unknown>, {
      name: 'AgentMarket — First-Party API',
      baseUrl: originOf(request),
    });
    reply.header('content-disposition', 'attachment; filename="agentmarket-first-party.postman_collection.json"');
    return collection;
  });
}
