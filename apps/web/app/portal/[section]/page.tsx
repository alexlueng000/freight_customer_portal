import { DataTable } from '@/components/data-table';
import { FilterBar } from '@/components/filter-bar';
import { PageHeader } from '@/components/page-header';
import { StatusBadge } from '@/components/status-badge';
import { portalShipments, type ShipmentRow } from '@/lib/mock-data';

const titles: Record<string, string> = {
  rates: '运价',
  quotes: '报价',
  bookings: '订舱',
  shipments: '出运',
  documents: '单证',
  billing: '账单',
  company: '公司资料',
  users: '用户',
};

const columns = [
  { key: 'shipmentNo', header: '参考编号' },
  { key: 'lane', header: '航线 / 对象' },
  { key: 'carrier', header: '船司 / 负责人' },
  { key: 'eta', header: '日期' },
  {
    key: 'status',
    header: '状态',
    render: (row: ShipmentRow) => <StatusBadge tone={row.tone}>{row.status}</StatusBadge>,
  },
];

export default async function PortalSectionPage({ params }: { params: Promise<{ section: string }> }) {
  const { section } = await params;
  const title = titles[section] ?? '客户门户';

  return (
    <div className="space-y-5">
      <PageHeader
        description="生产级页面框架占位，当前使用类型化模拟数据。本任务不接入 API。"
        eyebrow="客户门户"
        title={title}
      />
      <section className="rounded border border-border bg-surface">
        <FilterBar placeholder={`搜索${title}`} />
        <DataTable columns={columns} data={portalShipments} />
      </section>
    </div>
  );
}
