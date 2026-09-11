'use client';

import { useWallet } from '@/lib/wallet-context';
import { Wallet } from 'lucide-react';
import { Button } from './ui/button';

function truncate(address: string): string {
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

export function WalletConnectButton() {
  const { address, connecting, connect, disconnect } = useWallet();

  if (address) {
    return (
      <Button variant="secondary" size="sm" onClick={() => void disconnect()} title={address}>
        <span className="h-2 w-2 shrink-0 rounded-full bg-success shadow-[0_0_0_3px_var(--color-success-bg)]" />
        {truncate(address)}
      </Button>
    );
  }

  return (
    <Button size="sm" onClick={() => void connect()} loading={connecting} icon={!connecting ? <Wallet className="h-3.5 w-3.5" /> : undefined}>
      {connecting ? 'Connecting…' : 'Connect Wallet'}
    </Button>
  );
}
