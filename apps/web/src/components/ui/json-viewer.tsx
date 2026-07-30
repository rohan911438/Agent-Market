'use client';

export function JsonViewer({ data }: { data: unknown }) {
  return (
    <pre className="scrollbar-thin max-h-[32rem] overflow-auto rounded-lg bg-black/40 p-4 text-xs leading-relaxed text-accent">
      {JSON.stringify(data, null, 2)}
    </pre>
  );
}
