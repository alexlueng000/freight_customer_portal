import { DataTable } from '@/components/data-table';
import { FilterBar } from '@/components/filter-bar';
import { PageHeader } from '@/components/page-header';
import { StatusBadge } from '@/components/status-badge';
import { adminTasks, type ActionRow } from '@/lib/mock-data';

const titles: Record<string, string> = {
  customers: '客户',
  rates: '运价',
  quotes: '报价',
  bookings: '订舱',
  shipments: '出运',
  documents: '单证',
  invoices: '发票',
  users: '用户',
  'audit-logs': '审计日志',
  settings: '设置',
};

const columns = [
  { key: 'item', header: '记录' },
  { key: 'owner', header: '负责人' },
  { key: 'due', header: '日期' },
  {
    key: 'status',
    header: '状态',
    render: (row: ActionRow) => <StatusBadge tone={row.tone}>{row.status}</StatusBadge>,
  },
];

export default async function AdminSectionPage({ params }: { params: Promise<{ section: string }> }) {
  const { section } = await params;
  const title = titles[section] ?? '运营后台';

  return (
    <div className="space-y-5">
      <PageHeader
        description="生产级页面框架占位，当前使用类型化模拟数据。本任务不接入 API。"
        eyebrow="运营后台"
        title={title}
      />
      <section className="rounded border border-border bg-surface">
        <FilterBar placeholder={`搜索${title}`} />
        <DataTable columns={columns} data={adminTasks} />
      </section>
    </div>
  );
}
