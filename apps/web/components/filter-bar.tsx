import { Search, X } from 'lucide-react';

export function FilterBar({
  placeholder = '搜索',
  children,
  clearLabel = '清空筛选',
}: {
  placeholder?: string;
  children?: React.ReactNode;
  clearLabel?: string;
}) {
  return (
    <div className="flex flex-col gap-3 border-b border-border bg-sidebar px-4 py-3 md:flex-row md:items-center">
      <label className="relative min-w-0 flex-1">
        <Search aria-hidden className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" />
        <input
          className="h-9 w-full rounded border border-border bg-surface pl-9 pr-3 text-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/15"
          placeholder={placeholder}
          type="search"
        />
      </label>
      <div className="flex flex-wrap gap-2">
        {children}
        <button
          className="inline-flex h-9 items-center gap-2 rounded border border-border bg-surface px-3 text-sm font-medium text-muted hover:text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20"
          type="button"
        >
          <X aria-hidden className="size-4" />
          {clearLabel}
        </button>
      </div>
    </div>
  );
}
