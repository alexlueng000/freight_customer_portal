import { DataTable } from '@/components/data-table';
import { FilterBar } from '@/components/filter-bar';
import { MoneyDisplay } from '@/components/money-display';
import { PageHeader } from '@/components/page-header';
import { StatCard } from '@/components/stat-card';
import { StatusBadge } from '@/components/status-badge';
import {
  adminQuoteBookings,
  adminStats,
  adminTasks,
  type ActionRow,
  type QuoteBookingRow,
} from '@/lib/mock-data';

const taskColumns = [
  { key: 'item', header: '任务' },
  { key: 'owner', header: '角色' },
  { key: 'due', header: '截止时间' },
  {
    key: 'status',
    header: '状态',
    render: (row: ActionRow) => <StatusBadge tone={row.tone}>{row.status}</StatusBadge>,
  },
];

const overviewColumns = [
  { key: 'label', header: '周期' },
  { key: 'quotes', header: '报价数' },
  { key: 'bookings', header: '订舱数' },
  {
    key: 'conversion',
    header: '转化率',
    render: (row: QuoteBookingRow) => <StatusBadge tone="info">{row.conversion}</StatusBadge>,
  },
];

export default function AdminPage() {
  return (
    <div className="space-y-5">
      <PageHeader
        description="聚焦今天必须处理的订舱审核、SO 放单、近期离港、逾期账单和跨角色运营任务。"
        eyebrow="运营后台"
        title="仪表盘"
        actions={
          <>
            <button className="h-9 rounded border border-border bg-surface px-4 text-sm font-semibold" type="button">
              导出
            </button>
            <button className="h-9 rounded bg-primary px-4 text-sm font-semibold text-surface" type="button">
              创建报价
            </button>
          </>
        }
      />

      <section className="grid gap-3 xl:grid-cols-4">
        {adminStats.map((stat) => (
          <StatCard key={stat.label} stat={stat} />
        ))}
      </section>

      <section className="grid gap-5 xl:grid-cols-[1.45fr_1fr]">
        <div className="rounded border border-border bg-surface">
          <div className="grid gap-3 border-b border-border px-4 py-3 sm:grid-cols-3">
            <div>
              <p className="text-xs font-medium text-muted">待审订舱</p>
              <p className="mt-1 text-lg font-semibold">14</p>
            </div>
            <div>
              <p className="text-xs font-medium text-muted">待放 SO</p>
              <p className="mt-1 text-lg font-semibold">9</p>
            </div>
            <div>
              <p className="text-xs font-medium text-muted">运营任务</p>
              <p className="mt-1 text-lg font-semibold">31</p>
            </div>
          </div>
          <FilterBar placeholder="搜索订舱、SO、客户">
            <select className="h-9 rounded border border-border bg-surface px-3 text-sm text-muted">
              <option>全部角色</option>
              <option>销售</option>
              <option>操作</option>
              <option>财务</option>
            </select>
            <select className="h-9 rounded border border-border bg-surface px-3 text-sm text-muted">
              <option>全部优先级</option>
              <option>今日到期</option>
              <option>已逾期</option>
            </select>
          </FilterBar>
          <DataTable columns={taskColumns} data={adminTasks} />
        </div>

        <div className="rounded border border-border bg-surface">
          <div className="border-b border-border px-4 py-3">
            <h2 className="text-sm font-semibold">报价 / 订舱概览</h2>
          </div>
          <DataTable columns={overviewColumns} data={adminQuoteBookings} />
          <div className="border-t border-border px-4 py-3 text-sm text-muted">
            未结应收：
            <MoneyDisplay amount="188,000.00" currency="USD" />
          </div>
        </div>
      </section>
    </div>
  );
}
