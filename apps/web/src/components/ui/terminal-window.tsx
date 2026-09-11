import { cn } from '@/lib/utils';
import type { ReactNode } from 'react';

export function TerminalWindow({
  title,
  children,
  className,
}: {
  title: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('overflow-hidden rounded-2xl border border-code-border bg-code-bg shadow-card-hover', className)}>
      <div className="flex items-center gap-2 border-b border-code-border bg-white/[0.02] px-4 py-3">
        <span className="h-2.5 w-2.5 rounded-full bg-[#ff5f57]" />
        <span className="h-2.5 w-2.5 rounded-full bg-[#febc2e]" />
        <span className="h-2.5 w-2.5 rounded-full bg-[#28c840]" />
        <span className="ml-2 font-mono text-xs text-white/40">{title}</span>
      </div>
      {children}
    </div>
  );
}
