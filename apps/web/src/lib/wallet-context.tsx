'use client';

import { PeraWalletConnect } from '@perawallet/connect';
import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';

interface WalletContextValue {
  address: string | null;
  connecting: boolean;
  connect: () => Promise<void>;
  disconnect: () => Promise<void>;
}

const WalletContext = createContext<WalletContextValue | undefined>(undefined);

/**
 * Thin wrapper around Pera Wallet Connect. Instantiated client-side only
 * (inside useEffect) so it never runs during server rendering.
 */
export function WalletProvider({ children }: { children: ReactNode }) {
  const [address, setAddress] = useState<string | null>(null);
  const [connecting, setConnecting] = useState(false);
  const peraRef = useRef<PeraWalletConnect | null>(null);

  useEffect(() => {
    const pera = new PeraWalletConnect();
    peraRef.current = pera;
    pera
      .reconnectSession()
      .then((accounts) => {
        if (accounts.length > 0) setAddress(accounts[0] ?? null);
      })
      .catch(() => {
        // no existing session — nothing to do
      });
  }, []);

  const value = useMemo<WalletContextValue>(
    () => ({
      address,
      connecting,
      connect: async () => {
        if (!peraRef.current) return;
        setConnecting(true);
        try {
          const accounts = await peraRef.current.connect();
          setAddress(accounts[0] ?? null);
        } finally {
          setConnecting(false);
        }
      },
      disconnect: async () => {
        if (!peraRef.current) return;
        await peraRef.current.disconnect();
        setAddress(null);
      },
    }),
    [address, connecting],
  );

  return <WalletContext.Provider value={value}>{children}</WalletContext.Provider>;
}

export function useWallet(): WalletContextValue {
  const ctx = useContext(WalletContext);
  if (!ctx) throw new Error('useWallet must be used within WalletProvider');
  return ctx;
}
