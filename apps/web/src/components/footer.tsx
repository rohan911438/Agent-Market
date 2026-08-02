import { Zap } from 'lucide-react';

export function Footer() {
  return (
    <footer className="border-t border-border">
      <div className="mx-auto flex max-w-6xl flex-col items-center gap-3 px-6 py-10 text-center">
        <span className="flex items-center gap-2 text-sm font-semibold text-foreground">
          <span className="flex h-6 w-6 items-center justify-center rounded-md bg-[linear-gradient(135deg,var(--color-primary),var(--color-payment))] text-white">
            <Zap className="h-3.5 w-3.5" strokeWidth={2.5} />
          </span>
          AgentMarket
        </span>
        <p className="max-w-md text-sm text-muted">
          The marketplace for AI agent commerce — powered by x402 and settled on Algorand.
        </p>
        <p className="text-xs text-muted-2">Autonomous, per-request API commerce. No API keys, no subscriptions.</p>
      </div>
    </footer>
  );
}
