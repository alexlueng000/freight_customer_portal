export function LoadingState({ rows = 6 }: { rows?: number }) {
  return (
    <div className="rounded border border-border bg-surface">
      <div className="border-b border-border px-4 py-3">
        <div className="h-4 w-40 rounded bg-sidebar" />
      </div>
      <div className="divide-y divide-border">
        {Array.from({ length: rows }).map((_, index) => (
          <div key={index} className="grid grid-cols-4 gap-4 px-4 py-3">
            <div className="h-4 rounded bg-sidebar" />
            <div className="h-4 rounded bg-sidebar" />
            <div className="h-4 rounded bg-sidebar" />
            <div className="h-4 rounded bg-sidebar" />
          </div>
        ))}
      </div>
    </div>
  );
}
