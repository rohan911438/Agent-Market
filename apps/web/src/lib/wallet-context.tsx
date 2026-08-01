'use client';

import { PeraWalletConnect } from '@perawallet/connect';
import type { ClientAvmSigner } from '@x402-avm/avm';
import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { peraToClientAvmSigner } from './pera-signer';

function walletTokenStorageKey(address: string): string {
  return `agentmarket:wallet-token:${address}`;
}

interface WalletContextValue {
  address: string | null;
  connecting: boolean;
  connect: () => Promise<void>;
  disconnect: () => Promise<void>;
  /** Proof-of-payment token from a previously settled payment — see apps/api's wallet-token service. */
  walletToken: string | null;
  /** Persists a freshly-issued X-Wallet-Token (from a settled payment's response header) for this address. */
  setWalletToken: (token: string) => void;
  /** A `ClientAvmSigner` bound to the connected wallet, or null if nothing is connected. */
  getSigner: () => ClientAvmSigner | null;
}

const WalletContext = createContext<WalletContextValue | undefined>(undefined);

/**
 * Thin wrapper around Pera Wallet Connect. Instantiated client-side only
 * (inside useEffect) so it never runs during server rendering.
 */
export function WalletProvider({ children }: { children: ReactNode }) {
  const [address, setAddress] = useState<string | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [walletToken, setWalletTokenState] = useState<string | null>(null);
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

  // Load any previously-issued token for this address once it's known —
  // covers both a fresh connect and session reconnect on page load.
  useEffect(() => {
    if (!address) {
      setWalletTokenState(null);
      return;
    }
    setWalletTokenState(localStorage.getItem(walletTokenStorageKey(address)));
  }, [address]);

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
      walletToken,
      setWalletToken: (token: string) => {
        if (!address) return;
        localStorage.setItem(walletTokenStorageKey(address), token);
        setWalletTokenState(token);
      },
      getSigner: () => (peraRef.current && address ? peraToClientAvmSigner(peraRef.current, address) : null),
    }),
    [address, connecting, walletToken],
  );

  return <WalletContext.Provider value={value}>{children}</WalletContext.Provider>;
}

export function useWallet(): WalletContextValue {
  const ctx = useContext(WalletContext);
  if (!ctx) throw new Error('useWallet must be used within WalletProvider');
  return ctx;
}
