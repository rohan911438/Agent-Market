import type { FastifyRequest } from 'fastify';

/** Absolute origin for the current request — used to build openapi `servers`/Postman URLs that work in any environment (local, staging, prod) without a config value to keep in sync. */
export function originOf(request: FastifyRequest): string {
  const host = request.headers.host ?? 'localhost';
  return `${request.protocol}://${host}`;
}
