import { cn } from '@/lib/utils';
import type { TextareaHTMLAttributes } from 'react';

export interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  hint?: string;
}

export function Textarea({ label, hint, id, className, ...props }: TextareaProps) {
  const field = (
    <textarea
      id={id}
      className={cn(
        'w-full resize-y rounded-lg border border-border bg-background px-3 py-2.5 text-sm text-foreground placeholder:text-muted-2',
        'transition-colors outline-none focus:border-primary focus:ring-2 focus:ring-primary/20',
        className,
      )}
      {...props}
    />
  );

  if (!label) return field;

  return (
    <div>
      <label htmlFor={id} className="mb-1.5 flex items-baseline justify-between">
        <span className="text-xs font-medium text-muted">{label}</span>
        {hint && <span className="text-xs text-muted-2">{hint}</span>}
      </label>
      {field}
    </div>
  );
}
