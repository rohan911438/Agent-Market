import { cn } from '@/lib/utils';
import { ChevronDown } from 'lucide-react';
import type { ReactNode, SelectHTMLAttributes } from 'react';

export interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  children: ReactNode;
}

export function Select({ label, id, className, children, ...props }: SelectProps) {
  const select = (
    <div className="relative">
      <select
        id={id}
        className={cn(
          'w-full appearance-none rounded-lg border border-border bg-background px-3 py-2.5 pr-9 text-sm text-foreground',
          'transition-colors outline-none focus:border-primary focus:ring-2 focus:ring-primary/20',
          className,
        )}
        {...props}
      >
        {children}
      </select>
      <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-2" />
    </div>
  );

  if (!label) return select;

  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-xs font-medium text-muted">
        {label}
      </label>
      {select}
    </div>
  );
}
