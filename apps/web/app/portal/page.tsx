import { DataTable } from '@/components/data-table';
import { FilterBar } from '@/components/filter-bar';
import { MoneyDisplay } from '@/components/money-display';
import { PageHeader } from '@/components/page-header';
import { StatCard } from '@/components/stat-card';
import { StatusBadge } from '@/components/status-badge';
import Link from 'next/link';
import {
  portalActions,
  portalShipments,
  portalStats,
  type ShipmentRow,
} from '@/lib/mock-data';

const shipmentColumns = [
  { key: 'shipmentNo', header: '出运编号' },
  { key: 'lane', header: '航线' },
  { key: 'carrier', header: '船司' },
  { key: 'eta', header: '预计到港' },
  {
    key: 'status',
    header: '状态',
    render: (row: ShipmentRow) => <StatusBadge tone={row.tone}>{row.status}</StatusBadge>,
  },
];

export default function PortalPage() {
  return (
    <div className="space-y-5">
      <PageHeader
        description="快速查价、查看在途货物，并优先处理即将过期的报价、待确认文件和未结账单。"
        eyebrow="客户门户"
        title="仪表盘"
        actions={
          <Link
            className="inline-flex h-9 items-center rounded bg-primary px-4 text-sm font-semibold text-surface hover:bg-primary/90 focus:outline-none focus:ring-2 focus:ring-primary/20"
            href="/portal/rates"
          >
            查询运价
          </Link>
        }
      />

      <section className="rounded border border-border bg-surface">
        <div className="flex flex-col justify-between gap-2 border-b border-border px-4 py-3 lg:flex-row lg:items-center">
          <div>
            <h2 className="text-sm font-semibold">快速查价</h2>
            <p className="mt-1 text-xs text-muted">输入起运港、目的港、ETD 和箱型，快速生成可报价方案。</p>
          </div>
          <StatusBadge tone="info">核心入口</StatusBadge>
        </div>
        <form className="grid gap-3 p-4 md:grid-cols-[1fr_1fr_1fr_1fr_1fr_auto]">
          {['起运港', '目的港', 'ETD 日期范围', '箱型', '船司'].map((label) => (
            <label key={label} className="space-y-1.5">
              <span className="text-xs font-medium text-muted">{label}</span>
              <input
                className="h-9 w-full rounded border border-border bg-background px-3 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/15"
                placeholder={label}
              />
            </label>
          ))}
          <button className="h-9 self-end rounded bg-primary px-4 text-sm font-semibold text-surface" type="button">
            查询
          </button>
        </form>
      </section>

      <section className="grid gap-3 xl:grid-cols-4">
        {portalStats.map((stat) => (
          <StatCard key={stat.label} stat={stat} />
        ))}
      </section>

      <section className="grid gap-5 xl:grid-cols-[1.4fr_1fr]">
        <div className="rounded border border-border bg-surface">
          <div className="border-b border-border px-4 py-3">
            <h2 className="text-sm font-semibold">近期出运</h2>
          </div>
          <FilterBar placeholder="搜索出运、航线、船司">
            <select className="h-9 rounded border border-border bg-surface px-3 text-sm text-muted">
              <option>全部状态</option>
              <option>运输中</option>
              <option>待补单证</option>
            </select>
          </FilterBar>
          <DataTable columns={shipmentColumns} data={portalShipments} />
        </div>

        <div className="rounded border border-border bg-surface">
          <div className="border-b border-border px-4 py-3">
            <h2 className="text-sm font-semibold">待处理事项</h2>
          </div>
          <div className="divide-y divide-border">
            {portalActions.map((action) => (
              <Link
                className="block px-4 py-3 transition hover:bg-sidebar focus:outline-none focus:ring-2 focus:ring-inset focus:ring-primary/20"
                href="/portal/tasks"
                key={action.item}
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-foreground">{action.item}</p>
                  <p className="mt-1 text-xs text-muted">
                    {action.due} · {action.status}
                  </p>
                </div>
              </Link>
            ))}
          </div>
          <div className="space-y-3 border-t border-border px-4 py-3">
            <div className="grid gap-1 text-sm text-muted">
              <div>
                Outstanding · <MoneyDisplay amount="42,800.00" currency="USD" />
              </div>
              <div>
                Outstanding · <MoneyDisplay amount="18,500.00" currency="CNY" />
              </div>
            </div>
            <Link className="text-sm font-medium text-primary hover:underline" href="/portal/tasks">
              查看全部待办 →
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
