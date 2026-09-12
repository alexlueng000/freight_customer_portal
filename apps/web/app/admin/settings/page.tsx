'use client';

import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '@/components/auth-provider';
import { DataTable } from '@/components/data-table';
import { EmptyState } from '@/components/empty-state';
import { ErrorState, PermissionDeniedState } from '@/components/error-state';
import { LoadingState } from '@/components/loading-state';
import { PageHeader } from '@/components/page-header';
import { hasPermission } from '@/lib/auth';

interface PortMapping {
  code: string;
  chineseName: string;
  englishName: string;
  searchAliases: string[];
  importAliases: string[];
}

export default function SettingsPage() {
  const { apiFetch, user } = useAuth();
  const allowed = hasPermission(user, 'rate.read');
  const [items, setItems] = useState<PortMapping[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [forbidden, setForbidden] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!allowed) return;
    const controller = new AbortController();
    setLoading(true);
    setError(false);
    setForbidden(false);
    void apiFetch('/api/v1/rates/port-mappings', { signal: controller.signal })
      .then(async (response) => {
        if (response.status === 403) { setForbidden(true); return; }
        if (!response.ok) throw new Error('Failed to load port mappings');
        const data = await response.json() as { items: PortMapping[] };
        if (!controller.signal.aborted) setItems(data.items);
      })
      .catch(() => { if (!controller.signal.aborted) setError(true); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [allowed, apiFetch, attempt]);

  const filtered = useMemo(() => {
    const keyword = search.trim().toLowerCase().replace(/\s+/g, '');
    return items.filter((port) => [port.code, port.chineseName, port.englishName,
      ...port.searchAliases, ...port.importAliases].some((value) =>
      value.toLowerCase().replace(/\s+/g, '').includes(keyword)));
  }, [items, search]);

  return (
    <div className="space-y-5">
      <PageHeader eyebrow="运营后台 / 设置" title="基础港口映射表"
        description="查看系统内置的常用港口代码、中英文名称及识别别名。当前目录只读，覆盖常用地点，并非全球港口全集。" />
      {!allowed || forbidden ? <PermissionDeniedState /> : loading ? <LoadingState /> : error ? (
        <ErrorState description="港口映射加载失败，请重试。" onRetry={() => setAttempt((value) => value + 1)} />
      ) : (
        <section className="space-y-4 rounded border border-border bg-surface p-4">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div className="w-full sm:max-w-md">
              <label className="mb-2 block text-sm font-medium" htmlFor="port-search">搜索港口</label>
              <input id="port-search" value={search} onChange={(event) => setSearch(event.target.value)}
                placeholder="输入代码、中文名、英文名或别名" maxLength={150}
                className="h-10 w-full rounded border border-border bg-background px-3 text-sm" />
            </div>
            <p className="text-sm text-muted" role="status">显示 {filtered.length} / {items.length} 个港口</p>
          </div>
          <p className="text-sm leading-6 text-muted">客户查询与运价导入的别名范围不同，请以对应列为准。例如，导入时盐田、蛇口归入深圳；客户查询保留港区区分。</p>
          {filtered.length ? <DataTable data={filtered} getRowKey={(row) => row.code} columns={[
            { key: 'code', header: '港口代码', className: 'font-mono' },
            { key: 'chineseName', header: '中文名称' },
            { key: 'englishName', header: '英文名称' },
            { key: 'searchAliases', header: '客户查询别名', render: (row) => row.searchAliases.join('、') },
            { key: 'importAliases', header: '运价导入别名', render: (row) => row.importAliases.join('、') || '—' },
          ]} /> : <EmptyState title="未找到匹配港口" description="请更换港口代码、名称或别名重新搜索。" />}
        </section>
      )}
    </div>
  );
}
