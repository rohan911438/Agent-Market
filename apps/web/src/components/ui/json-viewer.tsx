'use client';

import { CopyButton } from '@/components/ui/copy-button';
import { cn } from '@/lib/utils';
import { motion } from 'framer-motion';
import { Fragment, type ReactNode } from 'react';

/** Tokenizes formatted JSON text for lightweight syntax highlighting — no external highlighter dependency. */
function highlight(json: string): ReactNode[] {
  const pattern = /("(\\u[a-zA-Z0-9]{4}|\\[^u]|[^\\"])*"(\s*:)?|\b(true|false|null)\b|-?\d+(\.\d+)?([eE][+-]?\d+)?)/g;
  const parts: { text: string; className: string }[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(json))) {
    if (match.index > lastIndex) {
      parts.push({ text: json.slice(lastIndex, match.index), className: 'text-muted' });
    }
    const token = match[0];
    let className = 'text-accent';
    if (/^"/.test(token)) {
      className = /:\s*$/.test(token) ? 'text-primary-hover' : 'text-success';
    } else if (/true|false/.test(token)) {
      className = 'text-warning';
    } else if (/null/.test(token)) {
      className = 'text-danger';
    }
    parts.push({ text: token, className });
    lastIndex = pattern.lastIndex;
  }
  if (lastIndex < json.length) parts.push({ text: json.slice(lastIndex), className: 'text-muted' });

  return parts.map((part, i) => (
    <Fragment key={i}>
      <span className={part.className}>{part.text}</span>
    </Fragment>
  ));
}

export function JsonViewer({ data, bare = false }: { data: unknown; bare?: boolean }) {
  const json = JSON.stringify(data, null, 2);

  return (
    <div className="group relative">
      <div className="absolute right-3 top-3 z-10 opacity-0 transition-opacity group-hover:opacity-100">
        <CopyButton value={json} />
      </div>
      <motion.pre
        key={json}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.2 }}
        className={cn(
          'scrollbar-thin max-h-[32rem] overflow-auto p-4 font-mono text-xs leading-relaxed',
          bare ? 'bg-code-bg' : 'rounded-lg border border-code-border bg-code-bg',
        )}
      >
        <code>{highlight(json)}</code>
      </motion.pre>
    </div>
  );
}
