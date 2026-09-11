import { cn } from '@/lib/utils';
import type { HTMLAttributes } from 'react';

export function Skeleton({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('shimmer rounded-md', className)} {...props} />;
}

export function SkeletonCard() {
  return (
    <div className="rounded-lg border border-border bg-surface p-5">
      <div className="mb-3 flex items-center justify-between">
        <Skeleton className="h-5 w-16" />
        <Skeleton className="h-5 w-12" />
      </div>
      <Skeleton className="mb-2 h-4 w-3/4" />
      <Skeleton className="h-3 w-full" />
      <Skeleton className="mt-1 h-3 w-2/3" />
    </div>
  );
}

export function SkeletonRow({ cols = 5 }: { cols?: number }) {
  return (
    <tr>
      {Array.from({ length: cols }).map((_, i) => (
        <td key={i} className="py-3 pr-4">
          <Skeleton className="h-4 w-full max-w-24" />
        </td>
      ))}
    </tr>
  );
}
