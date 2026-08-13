import Image from 'next/image';
import Link from 'next/link';

export function Footer() {
  return (
    <footer className="border-t border-border">
      <div className="mx-auto flex max-w-6xl flex-col items-center gap-3 px-6 py-10 text-center">
        <span className="flex items-center gap-2 text-sm font-semibold text-foreground">
          <span className="flex h-6 w-6 items-center justify-center overflow-hidden rounded-md">
            <Image src="/images/logo-mark.png" alt="AgentMarket logo" width={24} height={24} />
          </span>
          AgentMarket
        </span>
        <p className="max-w-md text-sm text-muted">
          The marketplace for AI agent commerce — powered by x402 and settled on Algorand.
        </p>
        <p className="text-xs text-muted-2">Autonomous, per-request API commerce. No API keys, no subscriptions.</p>
        <Link href="/status" className="text-xs text-muted-2 underline decoration-dotted underline-offset-4 hover:text-muted">
          System status
        </Link>
      </div>
    </footer>
  );
}
