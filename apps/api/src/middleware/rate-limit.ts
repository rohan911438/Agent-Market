import { AppError } from '@agentmarket/shared-types';
import type { FastifyReply, FastifyRequest } from 'fastify';
import type { AppContext } from '../context.js';
import { verifyWalletToken } from '../services/wallet-token.js';

function headerValue(raw: string | string[] | undefined): string | undefined {
  return Array.isArray(raw) ? raw[0] : raw;
}

/**
 * Anonymous requests are limited by IP (30/min default). A client is
 * promoted to the wallet tier (300/min default) only by presenting a valid
 * X-Wallet-Token — issued by this server (see wallet-token.ts) after that
 * wallet's first settled payment — for a wallet that is still marked
 * verified. A bare self-declared address is never trusted on its own: any
 * Algorand address is publicly visible on-chain, so accepting one unsigned
 * would let anyone claim someone else's verified tier.
 */
export function createRateLimitPreHandler(ctx: AppContext) {
  return async function rateLimitPreHandler(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const walletToken = headerValue(request.headers['x-wallet-token']);

    let identifier = `ip:${request.ip}`;
    let limit = ctx.config.rateLimits.anonymousPerMinute;

    if (walletToken) {
      const address = verifyWalletToken(walletToken, ctx.config.security.walletTokenSecret);
      if (address) {
        const wallet = await ctx.db.wallets.findByAddress(address);
        if (wallet?.isVerified) {
          identifier = `wallet:${address}`;
          limit = ctx.config.rateLimits.walletVerifiedPerMinute;
        }
      }
    }

    const result = await ctx.rateLimiter.consume(identifier, limit);
    reply.header('x-ratelimit-limit', result.limit);
    reply.header('x-ratelimit-remaining', result.remaining);

    if (!result.allowed) {
      reply.header('retry-after', result.resetSeconds);
      await ctx.db.auditLogs.record({
        actorType: identifier.startsWith('wallet:') ? 'wallet' : 'system',
        actorId: identifier,
        action: 'rate_limit.exceeded',
        metadata: { resource: request.url, limit: result.limit },
      });
      throw new AppError('RATE_LIMITED', 'Rate limit exceeded — slow down and retry later.', 429, {
        resetSeconds: result.resetSeconds,
      });
    }
  };
}
