import { cn } from '@/lib/utils';
import { Zap } from 'lucide-react';
import type { ReactNode } from 'react';

export interface MarqueeItem {
  label: string;
  value: string;
  detail?: string;
}

function Row({ items, ariaHidden }: { items: MarqueeItem[]; ariaHidden?: boolean }) {
  return (
    <div className="flex shrink-0 items-center" aria-hidden={ariaHidden}>
      {items.map((item, i) => (
        <div key={i} className="flex items-center gap-2 whitespace-nowrap px-6 text-sm">
          <span className="font-mono font-medium text-white/90">{item.label}</span>
          <span className="font-semibold text-accent">{item.value}</span>
          {item.detail && (
            <span className="flex items-center gap-0.5 text-xs font-medium text-success">
              <Zap className="h-3 w-3" />
              {item.detail}
            </span>
          )}
          <span className="ml-4 h-1 w-1 rounded-full bg-white/20" />
        </div>
      ))}
    </div>
  );
}

export function Marquee({ items, className }: { items: MarqueeItem[]; className?: string }): ReactNode {
  return (
    <div className={cn('mask-fade-x overflow-hidden', className)}>
      <div className="flex w-max animate-marquee">
        <Row items={items} />
        <Row items={items} ariaHidden />
      </div>
    </div>
  );
}
