'use client';

import { cn } from '@/lib/utils';
import { motion, useReducedMotion } from 'framer-motion';
import { Loader2 } from 'lucide-react';
import type { ButtonHTMLAttributes, ReactNode } from 'react';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'gradient';
type Size = 'sm' | 'md' | 'lg';

const variantClasses: Record<Variant, string> = {
  primary:
    'bg-primary text-primary-foreground shadow-glow-primary hover:bg-primary-hover disabled:shadow-none',
  secondary:
    'bg-surface text-foreground border border-border hover:border-border-strong hover:bg-surface-hover shadow-xs',
  ghost: 'bg-transparent text-muted hover:text-foreground hover:bg-surface-hover',
  danger: 'bg-danger-bg text-danger border border-danger/30 hover:bg-danger/20',
  gradient:
    'text-white bg-[linear-gradient(120deg,var(--color-primary),var(--color-payment))] shadow-glow-primary hover:brightness-110',
};

const sizeClasses: Record<Size, string> = {
  sm: 'px-3.5 py-1.5 text-sm gap-1.5',
  md: 'px-5 py-2.5 text-sm gap-2',
  lg: 'px-7 py-3.5 text-base gap-2.5',
};

type ConflictingHandlers = 'onDrag' | 'onDragStart' | 'onDragEnd' | 'onAnimationStart' | 'onAnimationEnd' | 'onAnimationIteration';

export interface ButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, ConflictingHandlers> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  icon?: ReactNode;
}

export function Button({
  variant = 'primary',
  size = 'md',
  loading = false,
  icon,
  disabled,
  className,
  children,
  ...props
}: ButtonProps) {
  const prefersReducedMotion = useReducedMotion();

  return (
    <motion.button
      whileHover={prefersReducedMotion || disabled || loading ? undefined : { scale: 1.015 }}
      whileTap={prefersReducedMotion || disabled || loading ? undefined : { scale: 0.98 }}
      transition={{ duration: 0.15, ease: 'easeOut' }}
      className={cn(
        'relative inline-flex select-none items-center justify-center rounded-full font-semibold tracking-tight transition-colors',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 focus-visible:ring-offset-2 focus-visible:ring-offset-background',
        'disabled:cursor-not-allowed disabled:opacity-50',
        variantClasses[variant],
        sizeClasses[size],
        className,
      )}
      disabled={disabled || loading}
      {...props}
    >
      {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : icon}
      {children}
    </motion.button>
  );
}
