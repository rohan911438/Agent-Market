'use client';

import { useWallet } from '@/lib/wallet-context';
import { Button } from './ui/button';

function truncate(address: string): string {
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

export function WalletConnectButton() {
  const { address, connecting, connect, disconnect } = useWallet();

  if (address) {
    return (
      <Button variant="secondary" size="sm" onClick={() => void disconnect()} title={address}>
        <span className="h-2 w-2 rounded-full bg-success" />
        {truncate(address)}
      </Button>
    );
  }

  return (
    <Button size="sm" onClick={() => void connect()} disabled={connecting}>
      {connecting ? 'Connecting…' : 'Connect Wallet'}
    </Button>
  );
}
