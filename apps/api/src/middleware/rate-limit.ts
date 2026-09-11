import { AppError } from '@agentmarket/shared-types';
import type { FastifyReply, FastifyRequest } from 'fastify';
import type { AppContext } from '../context.js';

function headerValue(raw: string | string[] | undefined): string | undefined {
  return Array.isArray(raw) ? raw[0] : raw;
}

/**
 * Anonymous requests are limited by IP (30/min default). A client that
 * self-identifies via X-Wallet-Address gets promoted to the wallet tier
 * (300/min default) once that wallet has at least one SETTLED payment on
 * record (see WalletRepository#markVerified, called from the payment
 * middleware after a successful settle).
 */
export function createRateLimitPreHandler(ctx: AppContext) {
  return async function rateLimitPreHandler(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const walletAddress = headerValue(request.headers['x-wallet-address']);

    let identifier = `ip:${request.ip}`;
    let limit = ctx.config.rateLimits.anonymousPerMinute;

    if (walletAddress) {
      const wallet = await ctx.db.wallets.findByAddress(walletAddress);
      if (wallet?.isVerified) {
        identifier = `wallet:${walletAddress}`;
        limit = ctx.config.rateLimits.walletVerifiedPerMinute;
      }
    }

    const result = await ctx.rateLimiter.consume(identifier, limit);
    reply.header('x-ratelimit-limit', result.limit);
    reply.header('x-ratelimit-remaining', result.remaining);

    if (!result.allowed) {
      reply.header('retry-after', result.resetSeconds);
      throw new AppError('RATE_LIMITED', 'Rate limit exceeded — slow down and retry later.', 429, {
        resetSeconds: result.resetSeconds,
      });
    }
  };
}
