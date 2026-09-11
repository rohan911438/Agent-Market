import { ProviderSessionProvider } from '@/lib/provider-context';
import type { ReactNode } from 'react';

export default function ProviderLayout({ children }: { children: ReactNode }) {
  return <ProviderSessionProvider>{children}</ProviderSessionProvider>;
}
