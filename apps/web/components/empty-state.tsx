import { Inbox } from 'lucide-react';

export function EmptyState({ title, description }: { title: string; description?: string }) {
  return (
    <div className="flex min-h-48 flex-col items-center justify-center rounded border border-dashed border-border bg-surface px-6 py-8 text-center">
      <Inbox aria-hidden className="size-8 text-muted" />
      <h3 className="mt-4 text-sm font-semibold">{title}</h3>
      {description ? <p className="mt-2 max-w-md text-sm leading-6 text-muted">{description}</p> : null}
    </div>
  );
}
