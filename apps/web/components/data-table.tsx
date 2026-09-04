import { EmptyState } from './empty-state';
import { ArrowUpDown } from 'lucide-react';

export interface DataTableColumn<T> {
  key: keyof T | string;
  header: string;
  className?: string;
  render?: (row: T) => React.ReactNode;
}

export function DataTable<T>({
  columns,
  data,
  emptyTitle = '暂无记录',
  getRowKey,
  onRowClick,
}: {
  columns: DataTableColumn<T>[];
  data: T[];
  emptyTitle?: string;
  getRowKey?: (row: T) => React.Key;
  onRowClick?: (row: T) => void;
}) {
  if (data.length === 0) {
    return (
      <EmptyState title={emptyTitle} description="后续接入真实业务流程后，相关记录会显示在这里。" />
    );
  }

  return (
    <>
      <div className="divide-y divide-border md:hidden">
        {data.map((row, index) => (
          <article
            key={getRowKey?.(row) ?? index}
            className={`space-y-3 px-4 py-4 ${onRowClick ? 'cursor-pointer active:bg-sidebar' : ''}`}
            onClick={onRowClick ? () => onRowClick(row) : undefined}
            onKeyDown={
              onRowClick
                ? (event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault();
                      onRowClick(row);
                    }
                  }
                : undefined
            }
            role={onRowClick ? 'link' : undefined}
            tabIndex={onRowClick ? 0 : undefined}
          >
            {columns.map((column, columnIndex) => {
              const value = row[column.key as keyof T] as React.ReactNode;
              return (
                <div
                  className={
                    columnIndex === 0
                      ? 'text-sm'
                      : 'grid grid-cols-[92px_minmax(0,1fr)] gap-3 text-sm'
                  }
                  key={String(column.key)}
                >
                  {columnIndex === 0 ? null : (
                    <div className="text-xs font-medium text-muted">{column.header}</div>
                  )}
                  <div className={columnIndex === 0 ? 'min-w-0' : 'min-w-0 text-right'}>
                    {column.render ? column.render(row) : value}
                  </div>
                </div>
              );
            })}
          </article>
        ))}
      </div>
      <div className="hidden overflow-x-auto md:block">
        <table className="w-full min-w-[720px] border-collapse text-left text-sm">
          <thead>
            <tr className="border-b border-border bg-sidebar text-xs uppercase tracking-normal text-muted">
              {columns.map((column) => (
                <th
                  key={String(column.key)}
                  className={`px-4 py-3 font-semibold ${column.className ?? ''}`}
                >
                  <button
                    className="inline-flex items-center gap-1.5 text-left text-xs font-semibold text-muted hover:text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20"
                    type="button"
                  >
                    {column.header}
                    <ArrowUpDown aria-hidden className="size-3" />
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.map((row, index) => (
              <tr
                key={getRowKey?.(row) ?? index}
                className={`border-b border-border last:border-b-0 hover:bg-sidebar/70 ${
                  onRowClick
                    ? 'cursor-pointer focus:bg-sidebar focus:outline-none focus:ring-2 focus:ring-inset focus:ring-primary/20'
                    : ''
                }`}
                onClick={onRowClick ? () => onRowClick(row) : undefined}
                onKeyDown={
                  onRowClick
                    ? (event) => {
                        if (event.key === 'Enter' || event.key === ' ') {
                          event.preventDefault();
                          onRowClick(row);
                        }
                      }
                    : undefined
                }
                role={onRowClick ? 'link' : undefined}
                tabIndex={onRowClick ? 0 : undefined}
              >
                {columns.map((column) => {
                  const value = row[column.key as keyof T] as React.ReactNode;

                  return (
                    <td
                      key={String(column.key)}
                      className={`px-4 py-3 align-middle ${column.className ?? ''}`}
                    >
                      {column.render ? column.render(row) : value}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
