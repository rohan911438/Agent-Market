import type { z } from 'zod';

export class SecretValidationError extends Error {
  constructor(issues: string[]) {
    super(`Invalid or missing environment configuration:\n${issues.map((i) => `  - ${i}`).join('\n')}`);
    this.name = 'SecretValidationError';
  }
}

/**
 * Typed, validated access to process.env (or any string-keyed source).
 *
 * Fails fast at construction time — an app with missing/invalid config
 * never partially boots. Error messages and `describeKeys()` only ever
 * surface *key names*, never values, so this class is safe to reference
 * from top-level error handlers/logs without risking a secret leak.
 */
export class SecretManager<TSchema extends z.ZodTypeAny> {
  private readonly values: z.infer<TSchema>;

  constructor(schema: TSchema, source: Record<string, string | undefined> = process.env) {
    const result = schema.safeParse(source);
    if (!result.success) {
      const issues = result.error.issues.map(
        (issue) => `${issue.path.join('.') || '(root)'}: ${issue.message}`,
      );
      throw new SecretValidationError(issues);
    }
    this.values = result.data;
  }

  get<K extends keyof z.infer<TSchema>>(key: K): z.infer<TSchema>[K] {
    return this.values[key];
  }

  getRequired<K extends keyof z.infer<TSchema>>(key: K): NonNullable<z.infer<TSchema>[K]> {
    const value = this.values[key];
    if (value === undefined || value === null || value === '') {
      throw new SecretValidationError([`${String(key)} is required but was not set`]);
    }
    return value as NonNullable<z.infer<TSchema>[K]>;
  }

  getOptional<K extends keyof z.infer<TSchema>>(key: K): z.infer<TSchema>[K] | undefined {
    return this.values[key] ?? undefined;
  }

  has(key: keyof z.infer<TSchema>): boolean {
    const value = this.values[key];
    return value !== undefined && value !== null && value !== '';
  }

  /** Safe for logs: key names only, never values. */
  describeKeys(): string[] {
    return Object.keys(this.values as object);
  }
}

export function createSecretManager<TSchema extends z.ZodTypeAny>(
  schema: TSchema,
  source?: Record<string, string | undefined>,
): SecretManager<TSchema> {
  return new SecretManager(schema, source);
}

const SECRET_KEY_PATTERN = /(key|token|secret|password|credential|auth)/i;

/**
 * Deep-clones a plain object, replacing values whose key looks
 * secret-shaped with "[REDACTED]". Used by the request logger so that an
 * accidental `log.info(config)` or `log.error(err, { context })` call can
 * never leak a credential into stdout/log aggregation.
 */
export function redactSecrets(input: unknown, seen = new WeakSet<object>()): unknown {
  if (input === null || typeof input !== 'object') return input;
  if (seen.has(input as object)) return '[CIRCULAR]';
  seen.add(input as object);

  if (Array.isArray(input)) {
    return input.map((item) => redactSecrets(item, seen));
  }

  const output: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(input as Record<string, unknown>)) {
    if (SECRET_KEY_PATTERN.test(key)) {
      output[key] = '[REDACTED]';
    } else if (typeof value === 'object' && value !== null) {
      output[key] = redactSecrets(value, seen);
    } else {
      output[key] = value;
    }
  }
  return output;
}
