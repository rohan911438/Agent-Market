'use client';

import { cn } from '@/lib/utils';
import { motion, useReducedMotion } from 'framer-motion';
import type { HTMLAttributes } from 'react';

type ConflictingHandlers = 'onDrag' | 'onDragStart' | 'onDragEnd' | 'onAnimationStart' | 'onAnimationEnd' | 'onAnimationIteration';

export interface CardProps extends Omit<HTMLAttributes<HTMLDivElement>, ConflictingHandlers> {
  /** Lift + border-glow on hover. Use for interactive/clickable cards. */
  interactive?: boolean;
}

export function Card({ className, interactive = false, ...props }: CardProps) {
  const prefersReducedMotion = useReducedMotion();

  return (
    <motion.div
      initial={false}
      whileHover={
        interactive && !prefersReducedMotion
          ? { y: -3, borderColor: 'var(--color-border-strong)', transition: { duration: 0.18 } }
          : undefined
      }
      className={cn(
        'rounded-2xl border border-border bg-surface shadow-card transition-shadow',
        interactive && 'cursor-pointer hover:shadow-card-hover',
        className,
      )}
      {...props}
    />
  );
}

export function CardHeader({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('border-b border-border px-5 py-4', className)} {...props} />;
}

export function CardBody({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('px-5 py-4', className)} {...props} />;
}

export function CardTitle({ className, ...props }: HTMLAttributes<HTMLHeadingElement>) {
  return (
    <h3 className={cn('font-display text-base font-bold tracking-tight text-foreground', className)} {...props} />
  );
}
