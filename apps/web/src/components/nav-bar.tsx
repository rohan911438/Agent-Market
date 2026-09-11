import Link from 'next/link';
import { WalletConnectButton } from './wallet-connect-button';

const LINKS = [
  { href: '/explorer', label: 'API Explorer' },
  { href: '/marketplace', label: 'Marketplace' },
  { href: '/pricing', label: 'Pricing' },
  { href: '/dashboard', label: 'Dashboard' },
  { href: '/docs', label: 'Docs' },
];

export function NavBar() {
  return (
    <header className="sticky top-0 z-50 border-b border-border bg-background/80 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
        <Link href="/" className="flex items-center gap-2 text-lg font-semibold text-white">
          <span className="flex h-7 w-7 items-center justify-center rounded-md bg-primary text-sm">A</span>
          AgentMarket
        </Link>
        <nav className="hidden items-center gap-6 text-sm text-muted md:flex">
          {LINKS.map((link) => (
            <Link key={link.href} href={link.href} className="transition-colors hover:text-white">
              {link.label}
            </Link>
          ))}
        </nav>
        <WalletConnectButton />
      </div>
    </header>
  );
}
