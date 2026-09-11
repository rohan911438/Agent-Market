import { Footer } from '@/components/footer';
import { NavBar } from '@/components/nav-bar';
import { WalletProvider } from '@/lib/wallet-context';
import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import './globals.css';

export const metadata: Metadata = {
  title: 'AgentMarket — x402 Financial Intelligence for AI Agents',
  description:
    'Pay-per-request decision intelligence APIs for AI agents and trading bots, settled on Algorand via x402.',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className="dark" suppressHydrationWarning>
      <body className="flex min-h-screen flex-col antialiased" suppressHydrationWarning>
        <WalletProvider>
          <NavBar />
          <main className="flex-1">{children}</main>
          <Footer />
        </WalletProvider>
      </body>
    </html>
  );
}
