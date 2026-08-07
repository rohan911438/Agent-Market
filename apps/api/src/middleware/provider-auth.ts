import { AppError } from '@agentmarket/shared-types';
import type { FastifyReply, FastifyRequest } from 'fastify';
import type { AppContext } from '../context.js';
import { hashApiKey } from '../services/provider-api-key.js';

function headerValue(raw: string | string[] | undefined): string | undefined {
  return Array.isArray(raw) ? raw[0] : raw;
}

/**
 * Gates every control-plane route behind a provider API key — issued once at
 * registration (see provider-account.route.ts), never stored raw. Resolves
 * to a `ProviderAccount` on the request so downstream handlers never touch
 * Prisma directly to re-fetch "who is calling."
 */
export function createProviderAuthPreHandler(ctx: AppContext) {
  return async function providerAuthPreHandler(request: FastifyRequest, _reply: FastifyReply): Promise<void> {
    const authHeader = headerValue(request.headers.authorization);
    const key = authHeader?.startsWith('Bearer ') ? authHeader.slice('Bearer '.length).trim() : undefined;

    if (!key) {
      throw new AppError('UNAUTHORIZED', 'Missing Authorization: Bearer <api key> header.', 401);
    }

    const account = await ctx.db.providerAccounts.findByApiKeyHash(hashApiKey(key));
    if (!account) {
      throw new AppError('UNAUTHORIZED', 'Invalid or revoked API key.', 401);
    }
    if (account.status === 'suspended') {
      throw new AppError('FORBIDDEN', 'This provider account is suspended.', 403);
    }

    request.providerAccount = account;
  };
}
