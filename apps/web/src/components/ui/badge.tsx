import { cn } from '@/lib/utils';
import type { HTMLAttributes, ReactNode } from 'react';

type Tone = 'default' | 'success' | 'warning' | 'danger' | 'accent' | 'info' | 'payment' | 'ai';

const toneClasses: Record<Tone, string> = {
  default: 'bg-surface-hover text-muted border-border',
  success: 'bg-success-bg text-success border-success/30',
  warning: 'bg-warning-bg text-warning border-warning/30',
  danger: 'bg-danger-bg text-danger border-danger/30',
  accent: 'bg-accent/10 text-accent border-accent/30',
  info: 'bg-info-bg text-info border-info/30',
  payment: 'bg-payment-bg text-payment border-payment/30',
  ai: 'bg-ai-bg text-ai border-ai/30',
};

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  tone?: Tone;
  icon?: ReactNode;
  dot?: boolean;
}

export function Badge({ tone = 'default', icon, dot = false, className, children, ...props }: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium leading-none',
        toneClasses[tone],
        className,
      )}
      {...props}
    >
      {dot && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-current" />}
      {icon}
      {children}
    </span>
  );
}
