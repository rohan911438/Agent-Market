import { Card, CardBody } from '@/components/ui/card';
import { CopyButton } from '@/components/ui/copy-button';
import { TriangleAlert } from 'lucide-react';

/** Shown exactly once — at registration and again after a key rotation. The key is never fetchable after this. */
export function ApiKeyReveal({ apiKey }: { apiKey: string }) {
  return (
    <Card className="border-warning/30 bg-warning-bg">
      <CardBody className="space-y-3">
        <div className="flex items-center gap-2 text-sm font-semibold text-warning">
          <TriangleAlert className="h-4 w-4" />
          Save this key now — it won&apos;t be shown again
        </div>
        <div className="flex items-center gap-2 rounded-lg border border-code-border bg-code-bg px-3 py-2.5">
          <code className="scrollbar-thin flex-1 overflow-x-auto whitespace-nowrap font-mono text-sm text-foreground">
            {apiKey}
          </code>
          <CopyButton value={apiKey} />
        </div>
        <p className="text-xs text-muted">
          Send it as <code className="rounded bg-surface-2 px-1 py-0.5 font-mono">Authorization: Bearer &lt;key&gt;</code> on
          every control-plane request. We only ever store its hash.
        </p>
      </CardBody>
    </Card>
  );
}
