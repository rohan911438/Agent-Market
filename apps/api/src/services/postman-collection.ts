import { extractOperations, type OpenApiParameter } from './openapi-spec.js';

/**
 * Minimal, hand-rolled OpenAPI 3.x -> Postman Collection v2.1 converter.
 *
 * `openapi-to-postmanv2` was evaluated first (per Phase 4's decision note)
 * but pulls in ~13 transitive deps (ajv, postman-collection, swagger2openapi,
 * its own js-yaml@4, ...) for what only ever needs to cover paths, methods,
 * query/path params and a JSON request body — exactly what
 * `openapi-spec.ts#extractOperations` already extracts for the docs/MCP
 * pipeline. Reusing that instead of a second, heavier OpenAPI walker is the
 * better trade for a feature explicitly scoped as "downloads and imports
 * cleanly", not "handles every OpenAPI construct".
 */
export interface PostmanCollection {
  info: { name: string; description?: string; schema: string };
  item: PostmanItem[];
}

interface PostmanItem {
  name: string;
  request: {
    method: string;
    header: { key: string; value: string }[];
    url: {
      raw: string;
      host: string[];
      path: string[];
      query?: { key: string; value: string; description?: string }[];
    };
    description?: string;
    body?: { mode: 'raw'; raw: string; options: { raw: { language: 'json' } } };
  };
}

function toPostmanPath(baseUrl: string, path: string): { raw: string; host: string[]; pathSegments: string[] } {
  const url = new URL(baseUrl);
  const segments = `${url.pathname}${path}`.split('/').filter(Boolean);
  // {param} -> :param, Postman's convention for path variables.
  const postmanSegments = segments.map((segment) => segment.replace(/^\{(.+)\}$/, ':$1'));
  return {
    raw: `${url.origin}/${postmanSegments.join('/')}`,
    host: [url.origin],
    pathSegments: postmanSegments,
  };
}

function exampleValueFor(schema: Record<string, unknown> | undefined): unknown {
  if (!schema) return '';
  if ('example' in schema) return schema.example;
  switch (schema.type) {
    case 'integer':
    case 'number':
      return 0;
    case 'boolean':
      return false;
    case 'array':
      return [];
    default:
      return '';
  }
}

export function buildPostmanCollection(
  document: Record<string, unknown>,
  options: { name: string; baseUrl: string },
): PostmanCollection {
  const operations = extractOperations(document);

  const item: PostmanItem[] = operations.map((operation) => {
    const { raw, host, pathSegments } = toPostmanPath(options.baseUrl, operation.path);

    const queryParams = operation.parameters.filter((p): p is OpenApiParameter => p.in === 'query');
    const query = queryParams.map((p) => ({
      key: p.name,
      value: String(exampleValueFor(p.schema) ?? ''),
      description: p.description,
    }));

    const hasBody = Boolean(operation.requestBodySchema) && operation.method !== 'get';

    return {
      name: operation.summary ?? operation.operationId,
      request: {
        method: operation.method.toUpperCase(),
        header: hasBody ? [{ key: 'Content-Type', value: 'application/json' }] : [],
        url: {
          raw: query.length > 0 ? `${raw}?${query.map((q) => `${q.key}=${q.value}`).join('&')}` : raw,
          host,
          path: pathSegments,
          query: query.length > 0 ? query : undefined,
        },
        description: operation.description,
        body: hasBody
          ? {
              mode: 'raw',
              raw: JSON.stringify(buildExampleBody(operation.requestBodySchema), null, 2),
              options: { raw: { language: 'json' } },
            }
          : undefined,
      },
    };
  });

  return {
    info: { name: options.name, schema: 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json' },
    item,
  };
}

function buildExampleBody(schema: Record<string, unknown> | undefined): unknown {
  if (!schema || schema.type !== 'object' || typeof schema.properties !== 'object') {
    return exampleValueFor(schema);
  }
  const properties = schema.properties as Record<string, Record<string, unknown>>;
  return Object.fromEntries(Object.entries(properties).map(([key, propSchema]) => [key, exampleValueFor(propSchema)]));
}
