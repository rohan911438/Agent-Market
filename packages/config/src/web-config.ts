import { createSecretManager } from '@agentmarket/secrets';
import { z } from 'zod';

// apps/web only ever reads NEXT_PUBLIC_* values, which Next.js inlines into
// the client bundle — so this schema must never contain a secret.
const WebEnvSchema = z.object({
  NEXT_PUBLIC_API_URL: z.string().url().default('http://localhost:4000'),
  NEXT_PUBLIC_ALGORAND_NETWORK: z.enum(['testnet', 'mainnet']).default('testnet'),
});
export type WebEnv = z.infer<typeof WebEnvSchema>;

export interface WebConfig {
  apiUrl: string;
  algorandNetwork: WebEnv['NEXT_PUBLIC_ALGORAND_NETWORK'];
}

export function loadWebConfig(source?: Record<string, string | undefined>): WebConfig {
  const secrets = createSecretManager(WebEnvSchema, source);
  return {
    apiUrl: secrets.get('NEXT_PUBLIC_API_URL'),
    algorandNetwork: secrets.get('NEXT_PUBLIC_ALGORAND_NETWORK'),
  };
}
