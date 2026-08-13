import { AppError } from '@rohankumar4179/shared-types';
import type { FastifyReply, FastifyRequest } from 'fastify';
import type { AppContext } from '../context.js';
import { hashApiKey, verifyApiKey } from '../services/provider-api-key.js';

function headerValue(raw: string | string[] | undefined): string | undefined {
  return Array.isArray(raw) ? raw[0] : raw;
}

/**
 * Gates admin-only routes (currently just the manual security-audit flag —
 * see routes/admin/provider-verification.route.ts) behind a single shared
 * bearer secret from config (`ADMIN_API_KEY`). There's no per-admin identity
 * or role system anywhere else in this codebase yet — this is deliberately
 * the minimal thing that isn't "unauthenticated," not a real admin-user
 * system. Compared with a timing-safe hash comparison, same as
 * provider-auth.ts does for provider keys.
 */
export function createAdminAuthPreHandler(ctx: AppContext) {
  return async function adminAuthPreHandler(request: FastifyRequest, _reply: FastifyReply): Promise<void> {
    const authHeader = headerValue(request.headers.authorization);
    const key = authHeader?.startsWith('Bearer ') ? authHeader.slice('Bearer '.length).trim() : undefined;

    if (!key || !verifyApiKey(key, hashApiKey(ctx.config.security.adminApiKey))) {
      throw new AppError('UNAUTHORIZED', 'Missing or invalid admin API key.', 401);
    }
  };
}
