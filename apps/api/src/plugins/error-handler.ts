import { redactSecrets } from '@agentmarket/secrets';
import type { ErrorResponse } from '@rohankumar4179/shared-types';
import { AppError } from '@rohankumar4179/shared-types';
import type { FastifyInstance } from 'fastify';
import { ZodError } from 'zod';

/**
 * Every failure path — validation, payment, rate limit, provider outage,
 * unhandled exception — funnels through here into the same
 * `{ error: { code, message, requestId } }` shape. No raw stack trace or
 * upstream error body ever reaches the client.
 */
export function registerErrorHandler(server: FastifyInstance): void {
  server.setErrorHandler((error: unknown, request, reply) => {
    if (error instanceof AppError) {
      request.errorCode = error.code;
      const body: ErrorResponse = {
        error: { code: error.code, message: error.message, requestId: request.requestId, details: error.details },
      };
      reply.code(error.statusCode).send(body);
      return;
    }

    if (error instanceof ZodError) {
      request.errorCode = 'VALIDATION_ERROR';
      const body: ErrorResponse = {
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Request validation failed',
          requestId: request.requestId,
          details: { issues: error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message })) },
        },
      };
      reply.code(400).send(body);
      return;
    }

    // Fastify's own schema-validation errors (route-level JSON schema, not zod).
    if (error instanceof Error && 'validation' in error && (error as { validation?: unknown }).validation) {
      request.errorCode = 'VALIDATION_ERROR';
      const body: ErrorResponse = {
        error: { code: 'VALIDATION_ERROR', message: error.message, requestId: request.requestId },
      };
      reply.code(400).send(body);
      return;
    }

    const unhandled = error instanceof Error ? error : new Error(String(error));
    request.errorCode = 'INTERNAL_ERROR';
    request.log.error(redactSecrets({ message: unhandled.message, stack: unhandled.stack }), 'unhandled error');
    const body: ErrorResponse = {
      error: { code: 'INTERNAL_ERROR', message: 'An unexpected error occurred', requestId: request.requestId },
    };
    reply.code(500).send(body);
  });

  server.setNotFoundHandler((request, reply) => {
    request.errorCode = 'NOT_FOUND';
    const body: ErrorResponse = {
      error: {
        code: 'NOT_FOUND',
        message: `Route ${request.method} ${request.url} not found`,
        requestId: request.requestId,
      },
    };
    reply.code(404).send(body);
  });
}
