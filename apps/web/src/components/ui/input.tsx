import { cn } from '@/lib/utils';
import type { InputHTMLAttributes, ReactNode } from 'react';

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  hint?: string;
  icon?: ReactNode;
}

export function Input({ label, hint, icon, id, className, ...props }: InputProps) {
  const input = (
    <div className="relative">
      {icon && (
        <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-2">{icon}</span>
      )}
      <input
        id={id}
        className={cn(
          'w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm text-foreground placeholder:text-muted-2',
          'transition-colors outline-none focus:border-primary focus:ring-2 focus:ring-primary/20',
          icon && 'pl-9',
          className,
        )}
        {...props}
      />
    </div>
  );

  if (!label) return input;

  return (
    <div>
      <label htmlFor={id} className="mb-1.5 flex items-baseline justify-between">
        <span className="text-xs font-medium text-muted">{label}</span>
        {hint && <span className="text-xs text-muted-2">{hint}</span>}
      </label>
      {input}
    </div>
  );
}
