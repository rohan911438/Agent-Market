import { Footer } from '@/components/footer';
import { NavBar } from '@/components/nav-bar';
import { ThemeProvider } from '@/lib/theme-context';
import { WalletProvider } from '@/lib/wallet-context';
import type { Metadata } from 'next';
import { Inter, JetBrains_Mono, Space_Grotesk } from 'next/font/google';
import type { ReactNode } from 'react';
import './globals.css';

const inter = Inter({ subsets: ['latin'], variable: '--font-inter', display: 'swap' });
const jetbrainsMono = JetBrains_Mono({ subsets: ['latin'], variable: '--font-mono-jb', display: 'swap' });
const spaceGrotesk = Space_Grotesk({ subsets: ['latin'], variable: '--font-space-grotesk', display: 'swap' });

export const metadata: Metadata = {
  title: 'AgentMarket — The Marketplace for AI Agent Commerce',
  description:
    'Pay-per-request decision intelligence APIs for AI agents and trading bots, settled on Algorand via x402.',
};

// Runs before hydration to set the persisted theme on <html> and prevent a
// light/dark flash. Purely presentational — no app state depends on this.
const THEME_INIT_SCRIPT = `
try {
  var t = localStorage.getItem('agentmarket:theme');
  if (t === 'light') document.documentElement.dataset.theme = 'light';
  else document.documentElement.dataset.theme = 'dark';
} catch (e) {}
`;

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html
      lang="en"
      data-theme="dark"
      className={`${inter.variable} ${jetbrainsMono.variable} ${spaceGrotesk.variable}`}
      suppressHydrationWarning
    >
      <body className="flex min-h-screen flex-col font-sans antialiased" suppressHydrationWarning>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
        <ThemeProvider>
          <WalletProvider>
            <NavBar />
            <main className="flex-1">{children}</main>
            <Footer />
          </WalletProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
