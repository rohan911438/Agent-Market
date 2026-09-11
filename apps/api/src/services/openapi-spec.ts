import { AppError } from '@rohankumar4179/shared-types';
import { load as loadYaml } from 'js-yaml';

const HTTP_METHODS = ['get', 'put', 'post', 'delete', 'options', 'head', 'patch', 'trace'] as const;
type HttpMethod = (typeof HTTP_METHODS)[number];

export interface OpenApiParameter {
  name: string;
  in: 'query' | 'path' | 'header' | 'cookie';
  required?: boolean;
  description?: string;
  schema?: Record<string, unknown>;
}

export interface OpenApiOperation {
  path: string;
  method: HttpMethod;
  operationId: string;
  summary?: string;
  description?: string;
  parameters: OpenApiParameter[];
  requestBodySchema?: Record<string, unknown>;
}

/**
 * Parses `openApiSpec` (JSON or YAML text) and validates it's a usable
 * OpenAPI 3.x document — matches the acceptance bar in Phase 4's spec:
 * reject what doesn't parse or is missing `paths`/an operation. This is
 * deliberately a structural check, not full JSON-Schema-meta-schema or
 * $ref-resolution validation (that's what a heavier library like
 * swagger-parser buys you, at a dependency cost this repo doesn't need yet
 * — every downstream consumer here — docs, postman, MCP — only ever reads
 * paths/operations/parameters, so that's all this validates).
 */
export function parseOpenApiSpec(raw: string): Record<string, unknown> {
  let doc: unknown;
  try {
    doc = raw.trim().startsWith('{') ? JSON.parse(raw) : loadYaml(raw);
  } catch (err) {
    throw new AppError('VALIDATION_ERROR', 'openApiSpec could not be parsed as JSON or YAML.', 400, {
      cause: err instanceof Error ? err.message : String(err),
    });
  }

  if (typeof doc !== 'object' || doc === null || Array.isArray(doc)) {
    throw new AppError('VALIDATION_ERROR', 'openApiSpec must parse to a JSON/YAML object.', 400);
  }

  const document = doc as Record<string, unknown>;

  const version = document.openapi;
  if (typeof version !== 'string' || !/^3\.\d+\.\d+$/.test(version)) {
    throw new AppError(
      'VALIDATION_ERROR',
      'openApiSpec must declare a 3.x "openapi" version field (e.g. "3.0.3" or "3.1.0").',
      400,
    );
  }

  if (typeof document.info !== 'object' || document.info === null) {
    throw new AppError('VALIDATION_ERROR', 'openApiSpec is missing the required "info" object.', 400);
  }

  const paths = document.paths;
  if (typeof paths !== 'object' || paths === null || Array.isArray(paths) || Object.keys(paths).length === 0) {
    throw new AppError('VALIDATION_ERROR', 'openApiSpec must declare at least one path under "paths".', 400);
  }

  const hasOperation = Object.values(paths as Record<string, unknown>).some(
    (pathItem) =>
      typeof pathItem === 'object' &&
      pathItem !== null &&
      HTTP_METHODS.some((method) => method in (pathItem as Record<string, unknown>)),
  );
  if (!hasOperation) {
    throw new AppError('VALIDATION_ERROR', 'openApiSpec must declare at least one HTTP operation across its paths.', 400);
  }

  return document;
}

/** Flattens a validated OpenAPI document's paths into one operation per method, for docs/postman/MCP generation. */
export function extractOperations(document: Record<string, unknown>): OpenApiOperation[] {
  const paths = document.paths as Record<string, Record<string, unknown>>;
  const operations: OpenApiOperation[] = [];

  for (const [path, pathItem] of Object.entries(paths)) {
    const pathLevelParameters = Array.isArray(pathItem.parameters) ? (pathItem.parameters as OpenApiParameter[]) : [];

    for (const method of HTTP_METHODS) {
      const operation = pathItem[method];
      if (typeof operation !== 'object' || operation === null) continue;
      const op = operation as Record<string, unknown>;

      const operationId =
        typeof op.operationId === 'string' && op.operationId.trim().length > 0
          ? op.operationId
          : `${method}_${path}`.replace(/[^a-zA-Z0-9]+/g, '_').replace(/^_+|_+$/g, '');

      const ownParameters = Array.isArray(op.parameters) ? (op.parameters as OpenApiParameter[]) : [];

      const requestBody = op.requestBody as Record<string, unknown> | undefined;
      const requestBodySchema =
        requestBody && typeof requestBody === 'object'
          ? ((requestBody.content as Record<string, { schema?: Record<string, unknown> }> | undefined)?.[
              'application/json'
            ]?.schema as Record<string, unknown> | undefined)
          : undefined;

      operations.push({
        path,
        method,
        operationId,
        summary: typeof op.summary === 'string' ? op.summary : undefined,
        description: typeof op.description === 'string' ? op.description : undefined,
        parameters: [...pathLevelParameters, ...ownParameters],
        requestBodySchema,
      });
    }
  }

  return operations;
}
