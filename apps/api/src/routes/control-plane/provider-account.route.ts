import {
  AppError,
  RegisterProviderRequestSchema,
  type ProviderAccountView,
} from '@agentmarket/shared-types';
import type { ProviderAccount } from '@prisma/client';
import type { FastifyInstance } from 'fastify';
import type { AppContext } from '../../context.js';
import { createProviderAuthPreHandler } from '../../middleware/provider-auth.js';
import { generateApiKey } from '../../services/provider-api-key.js';

function toView(account: ProviderAccount): ProviderAccountView {
  return {
    id: account.id,
    name: account.name,
    email: account.email,
    status: account.status as ProviderAccountView['status'],
    verifiedAt: account.verifiedAt ? account.verifiedAt.toISOString() : null,
  };
}

/**
 * Register -> Verify -> (rotate secrets), the account side of the
 * publishing pipeline. Listings (Upload -> Pricing -> Payment -> Publish)
 * live in listings.route.ts and require a verified account to go live.
 */
export function registerProviderAccountRoutes(server: FastifyInstance, ctx: AppContext): void {
  const requireProviderAuth = createProviderAuthPreHandler(ctx);

  // Free — anyone can start onboarding.
  server.post('/v1/providers/register', async (request, reply) => {
    const input = RegisterProviderRequestSchema.parse(request.body);

    const existing = await ctx.db.providerAccounts.findByEmail(input.email);
    if (existing) {
      throw new AppError('CONFLICT', 'A provider account already exists for this email.', 409);
    }

    const { key, hash } = generateApiKey();
    const account = await ctx.db.providerAccounts.create({
      name: input.name,
      email: input.email,
      walletAddress: input.walletAddress,
      apiKeyHash: hash,
    });

    await ctx.db.auditLogs.record({
      actorType: 'provider_account',
      actorId: account.id,
      action: 'provider_account.registered',
      metadata: { name: input.name },
    });

    reply.code(201);
    return { providerId: account.id, status: account.status, apiKey: key };
  });

  // Auth — the identity/anti-sybil check that has to pass before any listing can publish.
  server.post('/v1/providers/verify', { preHandler: requireProviderAuth }, async (request) => {
    const account = request.providerAccount!;

    if (account.status === 'verified') {
      return toView(account);
    }

    const clash = await ctx.db.providerAccounts.findVerifiedByWalletAddress(account.walletAddress);
    if (clash && clash.id !== account.id) {
      await ctx.db.auditLogs.record({
        actorType: 'provider_account',
        actorId: account.id,
        action: 'provider_account.verify_failed',
        metadata: { reason: 'wallet_already_verified_elsewhere' },
      });
      throw new AppError(
        'CONFLICT',
        'This wallet address is already verified under a different provider account.',
        409,
      );
    }

    const verified = await ctx.db.providerAccounts.markVerified(account.id);
    await ctx.db.auditLogs.record({
      actorType: 'provider_account',
      actorId: account.id,
      action: 'provider_account.verified',
    });
    return toView(verified);
  });

  // Auth — "Rotate secrets" from the dashboard capability list.
  server.post('/v1/providers/api-key/rotate', { preHandler: requireProviderAuth }, async (request) => {
    const account = request.providerAccount!;
    const { key, hash } = generateApiKey();
    await ctx.db.providerAccounts.rotateApiKey(account.id, hash);
    await ctx.db.auditLogs.record({
      actorType: 'provider_account',
      actorId: account.id,
      action: 'provider_account.api_key_rotated',
    });
    return { apiKey: key };
  });

  server.get('/v1/providers/me', { preHandler: requireProviderAuth }, async (request) => {
    return toView(request.providerAccount!);
  });
}
