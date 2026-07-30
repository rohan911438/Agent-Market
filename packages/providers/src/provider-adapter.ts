/**
 * Every upstream integration — market data or payment facilitator alike —
 * implements this same shape, so fallback/circuit-breaking logic in the
 * registry is written once and reused across every capability.
 */
export interface ProviderAdapter<TArgs, TResult> {
  readonly name: string;
  /** Cheap, synchronous check (e.g. "do we have an API key") — no network calls. */
  isAvailable(): boolean;
  execute(args: TArgs): Promise<TResult>;
}
