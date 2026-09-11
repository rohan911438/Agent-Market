'use client';

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

const STORAGE_KEY = 'agentmarket:provider-session';

export interface ProviderSession {
  providerId: string;
  apiKey: string;
}

interface ProviderSessionContextValue {
  session: ProviderSession | null;
  /** True until the initial localStorage read completes — avoids a flash of the signed-out state. */
  hydrated: boolean;
  setSession: (session: ProviderSession) => void;
  clearSession: () => void;
}

const ProviderSessionContext = createContext<ProviderSessionContextValue | undefined>(undefined);

/**
 * Holds the provider control-plane API key client-side only, the same way
 * wallet-context.tsx holds a wallet token — never sent anywhere but this
 * origin's fetch calls, never rendered back out after the one-time reveal
 * at registration/rotation.
 */
export function ProviderSessionProvider({ children }: { children: ReactNode }) {
  const [session, setSessionState] = useState<ProviderSession | null>(null);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) setSessionState(JSON.parse(raw) as ProviderSession);
    } catch {
      // corrupt/absent — treat as signed out
    } finally {
      setHydrated(true);
    }
  }, []);

  const value = useMemo<ProviderSessionContextValue>(
    () => ({
      session,
      hydrated,
      setSession: (next) => {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
        setSessionState(next);
      },
      clearSession: () => {
        localStorage.removeItem(STORAGE_KEY);
        setSessionState(null);
      },
    }),
    [session, hydrated],
  );

  return <ProviderSessionContext.Provider value={value}>{children}</ProviderSessionContext.Provider>;
}

export function useProviderSession(): ProviderSessionContextValue {
  const ctx = useContext(ProviderSessionContext);
  if (!ctx) throw new Error('useProviderSession must be used within ProviderSessionProvider');
  return ctx;
}
