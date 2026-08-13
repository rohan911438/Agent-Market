import { AppError } from '@rohankumar4179/shared-types';
import { describe, expect, it } from 'vitest';
import { extractOperations, parseOpenApiSpec } from './openapi-spec.js';

const VALID_JSON_SPEC = JSON.stringify({
  openapi: '3.0.3',
  info: { title: 'Test', version: '1.0.0' },
  paths: {
    '/things/{id}': {
      parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
      get: {
        operationId: 'getThing',
        summary: 'Get a thing',
        parameters: [{ name: 'verbose', in: 'query', schema: { type: 'boolean' } }],
        responses: { 200: { description: 'OK' } },
      },
      post: {
        summary: 'Create a thing',
        requestBody: {
          content: { 'application/json': { schema: { type: 'object', properties: { name: { type: 'string' } }, required: ['name'] } } },
        },
        responses: { 201: { description: 'Created' } },
      },
    },
  },
});

const VALID_YAML_SPEC = `
openapi: 3.0.3
info:
  title: Test
  version: 1.0.0
paths:
  /ping:
    get:
      operationId: ping
      responses:
        '200':
          description: OK
`;

describe('parseOpenApiSpec', () => {
  it('parses a valid JSON spec', () => {
    const doc = parseOpenApiSpec(VALID_JSON_SPEC);
    expect(doc.openapi).toBe('3.0.3');
  });

  it('parses a valid YAML spec', () => {
    const doc = parseOpenApiSpec(VALID_YAML_SPEC);
    expect(doc.openapi).toBe('3.0.3');
  });

  it('rejects text that is neither JSON nor YAML', () => {
    expect(() => parseOpenApiSpec(': :: not-yaml-or-json {{{')).toThrow(AppError);
  });

  it('rejects an array at the top level', () => {
    expect(() => parseOpenApiSpec('[1, 2, 3]')).toThrow(AppError);
  });

  it('rejects a spec with a non-3.x openapi version', () => {
    const doc = JSON.stringify({ openapi: '2.0', info: {}, paths: { '/x': { get: {} } } });
    expect(() => parseOpenApiSpec(doc)).toThrow(AppError);
  });

  it('rejects a spec missing "info"', () => {
    const doc = JSON.stringify({ openapi: '3.0.3', paths: { '/x': { get: {} } } });
    expect(() => parseOpenApiSpec(doc)).toThrow(AppError);
  });

  it('rejects a spec with an empty paths object', () => {
    const doc = JSON.stringify({ openapi: '3.0.3', info: {}, paths: {} });
    expect(() => parseOpenApiSpec(doc)).toThrow(AppError);
  });

  it('rejects a spec whose paths have no HTTP operations', () => {
    const doc = JSON.stringify({ openapi: '3.0.3', info: {}, paths: { '/x': { summary: 'no verbs here' } } });
    expect(() => parseOpenApiSpec(doc)).toThrow(AppError);
  });

  it('carries the parse failure reason in error details', () => {
    expect.assertions(2);
    try {
      parseOpenApiSpec('{ broken');
    } catch (err) {
      expect(err).toBeInstanceOf(AppError);
      expect((err as AppError).details?.cause).toBeDefined();
    }
  });
});

describe('extractOperations', () => {
  it('flattens path-level and operation-level parameters, and both methods on one path', () => {
    const doc = parseOpenApiSpec(VALID_JSON_SPEC);
    const ops = extractOperations(doc);

    expect(ops).toHaveLength(2);

    const get = ops.find((op) => op.method === 'get')!;
    expect(get.operationId).toBe('getThing');
    expect(get.parameters.map((p) => p.name)).toEqual(['id', 'verbose']);

    const post = ops.find((op) => op.method === 'post')!;
    expect(post.operationId).toBe('post_things_id'); // no operationId in the spec -> derived fallback
    expect(post.parameters.map((p) => p.name)).toEqual(['id']); // inherits the path-level parameter
    expect(post.requestBodySchema).toEqual({ type: 'object', properties: { name: { type: 'string' } }, required: ['name'] });
  });
});
