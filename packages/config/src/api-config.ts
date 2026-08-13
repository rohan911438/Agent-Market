import { createSecretManager } from '@agentmarket/secrets';
import { z } from 'zod';

const ApiEnvSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: z.coerce.number().int().positive().default(4000),
    HOST: z.string().default('0.0.0.0'),
    CORS_ORIGIN: z.string().default('http://localhost:3000'),
    LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),

    DATABASE_URL: z.string().default('file:./dev.db'),

    CACHE_DRIVER: z.enum(['memory', 'redis']).default('memory'),
    REDIS_URL: z.string().optional(),

    // Defaults to the in-process mock provider so the API boots and the
    // full 402 -> pay -> 200 flow can be exercised with zero external
    // config. Set PAYMENT_PROVIDER=algorand-x402 for the real TestNet flow.
    PAYMENT_PROVIDER: z.enum(['mock', 'algorand-x402']).default('mock'),
    ALGORAND_NETWORK: z.enum(['testnet', 'mainnet']).default('testnet'),
    X402_FACILITATOR_URL: z.string().url().optional(),
    X402_PAY_TO_ADDRESS: z.string().optional(),
    X402_USDC_ASSET_ID: z.string().optional(),
    // The facilitator's fee-payer account for this network (its
    // `extra.feePayer` from GET {facilitatorUrl}/supported) — needed so the
    // AVM "exact" v2 scheme can build its fee-sponsored atomic group.
    X402_FEE_PAYER_ADDRESS: z.string().optional(),
    // Offers a second, native-ALGO PaymentRequirement alongside the primary
    // stablecoin one (see algorand-x402-provider.ts's getRequirements()).
    // Defaults OFF: the live GoPlausible facilitator's `exact` scheme
    // verification requires the payment to be an ASA AssetTransfer and
    // hard-rejects a plain native Payment transaction ("Payment transaction
    // is not an asset transfer") — confirmed empirically against TestNet.
    // The client-side signer and provider logic are fully built and correct;
    // this flag exists so a future/alternate facilitator that does support
    // native-currency settlement can turn it on without any code changes.
    X402_ENABLE_NATIVE_ALGO: z.coerce.boolean().default(false),

    RATE_LIMIT_ANON_PER_MIN: z.coerce.number().int().positive().default(30),
    RATE_LIMIT_WALLET_PER_MIN: z.coerce.number().int().positive().default(300),
    DAILY_SPEND_CAP_USD: z.coerce.number().nonnegative().default(50),

    // Signs the proof-of-verification token issued to a wallet after its
    // first settled payment (see apps/api rate-limit middleware) so tier
    // promotion can't be spoofed by simply sending someone else's public
    // address. The insecure dev default only ever applies outside production
    // (enforced below) — every real deploy must set its own.
    WALLET_TOKEN_SECRET: z.string().min(1).default('dev-only-insecure-wallet-token-secret'),

    // Gates the admin-only endpoints (currently just the manual
    // security-audit flag — see routes/admin/provider-verification.route.ts).
    // There's no admin-role concept anywhere else in the codebase yet, so
    // this is a single shared bearer secret, checked the same way
    // provider-auth.ts checks provider keys — not a per-admin identity
    // system. The insecure dev default is banned in production, same as
    // WALLET_TOKEN_SECRET.
    ADMIN_API_KEY: z.string().min(1).default('dev-only-insecure-admin-api-key'),

    // Optional keyed providers: every keyless provider (CoinGecko, Binance,
    // Alternative.me, DefiLlama) works with none of these set.
    NEWS_API_KEY: z.string().optional(),
  })
  .superRefine((env, ctx) => {
    if (env.PAYMENT_PROVIDER === 'algorand-x402') {
      (['X402_FACILITATOR_URL', 'X402_PAY_TO_ADDRESS', 'X402_USDC_ASSET_ID'] as const).forEach((key) => {
        if (!env[key]) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: [key],
            message: `${key} is required when PAYMENT_PROVIDER=algorand-x402`,
          });
        }
      });
    }
    if (env.CACHE_DRIVER === 'redis' && !env.REDIS_URL) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['REDIS_URL'],
        message: 'REDIS_URL is required when CACHE_DRIVER=redis',
      });
    }
    if (env.NODE_ENV === 'production') {
      if (env.PAYMENT_PROVIDER === 'mock') {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['PAYMENT_PROVIDER'],
          message: 'PAYMENT_PROVIDER=mock is not allowed when NODE_ENV=production — set algorand-x402',
        });
      }
      if (env.WALLET_TOKEN_SECRET === 'dev-only-insecure-wallet-token-secret') {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['WALLET_TOKEN_SECRET'],
          message: 'WALLET_TOKEN_SECRET must be set to a real secret when NODE_ENV=production',
        });
      }
      if (env.ADMIN_API_KEY === 'dev-only-insecure-admin-api-key') {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['ADMIN_API_KEY'],
          message: 'ADMIN_API_KEY must be set to a real secret when NODE_ENV=production',
        });
      }
    }
  });

export type ApiEnv = z.infer<typeof ApiEnvSchema>;

export interface ApiConfig {
  env: ApiEnv['NODE_ENV'];
  isProduction: boolean;
  server: {
    port: number;
    host: string;
    corsOrigin: string;
    logLevel: ApiEnv['LOG_LEVEL'];
  };
  database: { url: string };
  cache: { driver: ApiEnv['CACHE_DRIVER']; redisUrl?: string };
  payments: {
    provider: ApiEnv['PAYMENT_PROVIDER'];
    algorandNetwork: ApiEnv['ALGORAND_NETWORK'];
    facilitatorUrl?: string;
    payToAddress?: string;
    usdcAssetId?: string;
    feePayerAddress?: string;
    enableNativeAlgo: boolean;
  };
  rateLimits: {
    anonymousPerMinute: number;
    walletVerifiedPerMinute: number;
    dailySpendCapUsd: number;
  };
  // Backend-only. Never serialized into an HTTP response or shipped to apps/web.
  providerKeys: { newsApiKey?: string };
  // Backend-only. Signs the wallet-verification token; never logged or returned to clients.
  security: { walletTokenSecret: string; adminApiKey: string };
}

export function loadApiConfig(source?: Record<string, string | undefined>): ApiConfig {
  const secrets = createSecretManager(ApiEnvSchema, source);
  return {
    env: secrets.get('NODE_ENV'),
    isProduction: secrets.get('NODE_ENV') === 'production',
    server: {
      port: secrets.get('PORT'),
      host: secrets.get('HOST'),
      corsOrigin: secrets.get('CORS_ORIGIN'),
      logLevel: secrets.get('LOG_LEVEL'),
    },
    database: { url: secrets.get('DATABASE_URL') },
    cache: {
      driver: secrets.get('CACHE_DRIVER'),
      redisUrl: secrets.getOptional('REDIS_URL'),
    },
    payments: {
      provider: secrets.get('PAYMENT_PROVIDER'),
      algorandNetwork: secrets.get('ALGORAND_NETWORK'),
      facilitatorUrl: secrets.getOptional('X402_FACILITATOR_URL'),
      payToAddress: secrets.getOptional('X402_PAY_TO_ADDRESS'),
      usdcAssetId: secrets.getOptional('X402_USDC_ASSET_ID'),
      feePayerAddress: secrets.getOptional('X402_FEE_PAYER_ADDRESS'),
      enableNativeAlgo: secrets.get('X402_ENABLE_NATIVE_ALGO'),
    },
    rateLimits: {
      anonymousPerMinute: secrets.get('RATE_LIMIT_ANON_PER_MIN'),
      walletVerifiedPerMinute: secrets.get('RATE_LIMIT_WALLET_PER_MIN'),
      dailySpendCapUsd: secrets.get('DAILY_SPEND_CAP_USD'),
    },
    providerKeys: { newsApiKey: secrets.getOptional('NEWS_API_KEY') },
    security: { walletTokenSecret: secrets.get('WALLET_TOKEN_SECRET'), adminApiKey: secrets.get('ADMIN_API_KEY') },
  };
}
