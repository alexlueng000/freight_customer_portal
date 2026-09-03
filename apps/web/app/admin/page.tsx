'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowRight, Bell, BriefcaseBusiness } from 'lucide-react';
import { useAuth } from '@/components/auth-provider';
import { DataTable, type DataTableColumn } from '@/components/data-table';
import { EmptyState } from '@/components/empty-state';
import { ErrorState } from '@/components/error-state';
import { LoadingState } from '@/components/loading-state';
import { PageHeader } from '@/components/page-header';
import { StatusBadge } from '@/components/status-badge';
import { bookingStatusLabel, bookingStatusTone } from '@/lib/booking-status';
import type { StatusTone } from '@/lib/mock-data';
import { quoteStatusLabel, quoteStatusTone } from '@/lib/quote-status';
import { shipmentStatusLabel, shipmentStatusTone } from '@/lib/shipment-status';

type AdminTaskType = 'QUOTE' | 'BOOKING' | 'SHIPMENT' | 'INVOICE' | 'CUSTOMER' | 'USER';

interface AdminTask {
  id: string;
  type: AdminTaskType;
  status: string;
  title: string;
  route: string;
  href: string;
  actionLabel: string;
  meta?: string;
}

interface RoleView {
  code: 'SALES' | 'OPERATION' | 'FINANCE' | 'TENANT_ADMIN';
  title: string;
  description: string;
  primaryActionLabel: string;
  primaryActionHref: string;
}

interface SummaryItem {
  label: string;
  value: number;
  href: string;
  tone: StatusTone;
  description: string;
}

interface NotificationItem {
  id: string;
  type: string;
  payload: { title?: string; description?: string; href?: string };
  readAt: string | null;
}

interface TaskRow {
  id: string;
  type: AdminTaskType;
  item: string;
  scope: string;
  status: string;
  tone: StatusTone;
  href: string;
  actionLabel: string;
  meta?: string;
}

interface DashboardResponse {
  roleView: RoleView;
  stats: {
    submittedBookings: number;
    bookingSubmitted: number;
    departedShipments: number;
    issuedInvoices: number;
    unreadNotifications: number;
  };
  summary: SummaryItem[];
  tasks: AdminTask[];
  notifications: NotificationItem[];
}

const taskColumns: Array<DataTableColumn<TaskRow>> = [
  {
    key: 'item',
    header: '任务',
    render: (row) => (
      <Link className="font-semibold text-primary hover:underline" href={row.href}>
        {row.item}
      </Link>
    ),
  },
  { key: 'scope', header: '业务焦点' },
  {
    key: 'status',
    header: '状态',
    render: (row) => <StatusBadge tone={row.tone}>{row.status}</StatusBadge>,
  },
  {
    key: 'actionLabel',
    header: '下一步',
    render: (row) => (
      <Link
        className="inline-flex items-center gap-1 text-sm font-semibold text-primary hover:underline"
        href={row.href}
      >
        {row.actionLabel}
        <ArrowRight aria-hidden className="size-3.5" />
      </Link>
    ),
  },
];

export default function AdminPage() {
  const { apiFetch } = useAuth();
  const [dashboard, setDashboard] = useState<DashboardResponse | null>(null);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const response = await apiFetch('/api/v1/dashboard/admin');
      const payload = (await response.json()) as DashboardResponse & { message?: string };
      if (!response.ok) throw new Error(payload.message ?? 'Dashboard 加载失败。');
      setDashboard(payload);
      setNotifications(payload.notifications);
    } catch (reason) {
      setError((reason as Error).message);
    } finally {
      setLoading(false);
    }
  }, [apiFetch]);

  useEffect(() => {
    void load();
  }, [load]);

  const tasks = useMemo<TaskRow[]>(() => {
    return (dashboard?.tasks ?? []).map((task) => ({
      id: task.id,
      type: task.type,
      item: task.type === 'SHIPMENT' ? `${task.title} · ${task.route}` : task.title,
      scope: task.meta ?? task.route,
      status: statusLabel(task),
      tone: statusTone(task),
      href: task.href,
      actionLabel: task.actionLabel,
      meta: task.meta,
    }));
  }, [dashboard]);

  const unread = notifications.filter((item) => !item.readAt);
  const roleView = dashboard?.roleView ?? fallbackRoleView;
  const summary = dashboard?.summary ?? fallbackSummary;

  return (
    <div className="space-y-5">
      <PageHeader
        description={roleView.description}
        eyebrow="角色化后台"
        title={roleView.title}
        actions={
          <Link
            className="inline-flex h-9 items-center gap-2 rounded bg-primary px-4 text-sm font-semibold text-surface"
            href={roleView.primaryActionHref}
          >
            <BriefcaseBusiness aria-hidden className="size-4" />
            {roleView.primaryActionLabel}
          </Link>
        }
      />

      {loading ? (
        <LoadingState rows={8} />
      ) : error ? (
        <ErrorState description={error} onRetry={() => void load()} />
      ) : (
        <>
          <section className="grid gap-3 lg:grid-cols-2 xl:grid-cols-4">
            {summary.map((stat) => (
              <Link
                className="block min-h-28 rounded border border-border bg-surface p-4 transition hover:border-primary/30 hover:bg-sidebar"
                href={stat.href}
                key={stat.label}
              >
                <div className="flex items-start justify-between gap-3">
                  <p className="text-xs font-medium text-muted">{stat.label}</p>
                  <StatusBadge tone={stat.tone}>{stat.value}</StatusBadge>
                </div>
                <div className="mt-3 text-2xl font-semibold">{stat.value}</div>
                <p className="mt-2 text-xs leading-5 text-muted">{stat.description}</p>
              </Link>
            ))}
          </section>

          <section className="grid gap-5 xl:grid-cols-[1.45fr_1fr]">
            <div className="rounded border border-border bg-surface">
              <div className="border-b border-border px-4 py-3">
                <h2 className="text-sm font-semibold">本角色待办</h2>
                <p className="mt-1 text-xs text-muted">
                  仅显示当前账号权限范围内最需要处理的业务。
                </p>
              </div>
              <DataTable
                columns={taskColumns}
                data={tasks}
                emptyTitle="当前没有本角色待办"
                getRowKey={(row) => row.id}
              />
            </div>

            <div className="rounded border border-border bg-surface" id="notifications">
              <div className="flex items-center gap-2 border-b border-border px-4 py-3">
                <Bell aria-hidden className="size-4 text-primary" />
                <h2 className="text-sm font-semibold">未读通知</h2>
              </div>
              {unread.length ? (
                <div className="divide-y divide-border">
                  {unread.slice(0, 6).map((item) => (
                    <Link
                      className="block px-4 py-3 hover:bg-sidebar"
                      href={item.payload.href ?? '/admin'}
                      key={item.id}
                    >
                      <p className="text-sm font-medium">{item.payload.title ?? item.type}</p>
                      <p className="mt-1 line-clamp-2 text-xs leading-5 text-muted">
                        {item.payload.description ?? '有一条新的业务通知。'}
                      </p>
                    </Link>
                  ))}
                </div>
              ) : (
                <div className="p-4">
                  <EmptyState
                    title="当前没有未读通知"
                    description="SO、Shipment 和 Booking 协同事件会出现在这里。"
                  />
                </div>
              )}
            </div>
          </section>
        </>
      )}
    </div>
  );
}

const fallbackRoleView: RoleView = {
  code: 'OPERATION',
  title: 'Operation Dashboard',
  description: '聚焦订舱审核、SO 登记、Shipment 节点和单证履约。',
  primaryActionLabel: '查看订舱',
  primaryActionHref: '/admin/bookings',
};

const fallbackSummary: SummaryItem[] = [
  {
    label: '待办',
    value: 0,
    href: '/admin',
    tone: 'neutral',
    description: 'Dashboard 加载完成后会显示当前角色指标。',
  },
];

const invoiceStatusLabels: Record<string, string> = {
  DRAFT: '草稿',
  ISSUED: '已发送',
  CUSTOMER_CONFIRMED: '客户已确认',
  PAID: '已收款',
  VOID: '已作废',
};

const invoiceStatusTones: Record<string, StatusTone> = {
  DRAFT: 'warning',
  ISSUED: 'info',
  CUSTOMER_CONFIRMED: 'success',
  PAID: 'success',
  VOID: 'neutral',
};

const customerStatusLabels: Record<string, string> = {
  ACTIVE: '启用',
  INACTIVE: '停用',
  BLOCKED: '冻结',
};

const userStatusLabels: Record<string, string> = {
  ACTIVE: '启用',
  INVITED: '待激活',
  LOCKED: '已锁定',
  DISABLED: '停用',
};

function statusLabel(task: AdminTask) {
  if (task.type === 'QUOTE') return quoteStatusLabel(task.status);
  if (task.type === 'BOOKING') return bookingStatusLabel(task.status);
  if (task.type === 'SHIPMENT') return shipmentStatusLabel(task.status, 'admin');
  if (task.type === 'INVOICE') return invoiceStatusLabels[task.status] ?? task.status;
  if (task.type === 'CUSTOMER') return customerStatusLabels[task.status] ?? task.status;
  if (task.type === 'USER') return userStatusLabels[task.status] ?? task.status;
  return task.status;
}

function statusTone(task: AdminTask): StatusTone {
  if (task.type === 'QUOTE') return quoteStatusTone(task.status);
  if (task.type === 'BOOKING') return bookingStatusTone(task.status);
  if (task.type === 'SHIPMENT') return shipmentStatusTone(task.status);
  if (task.type === 'INVOICE') return invoiceStatusTones[task.status] ?? 'neutral';
  if (task.type === 'CUSTOMER') return task.status === 'ACTIVE' ? 'success' : 'warning';
  if (task.type === 'USER') return task.status === 'ACTIVE' ? 'success' : 'warning';
  return 'neutral';
}
