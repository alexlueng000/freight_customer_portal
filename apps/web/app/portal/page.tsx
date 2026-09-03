'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAuth } from '@/components/auth-provider';
import { EmptyState } from '@/components/empty-state';
import { ErrorState } from '@/components/error-state';
import { LoadingState } from '@/components/loading-state';
import { PageHeader } from '@/components/page-header';
import { StatusBadge } from '@/components/status-badge';
import { formatDate } from '@/lib/formatters';
import { shipmentStatusLabel, shipmentStatusTone } from '@/lib/shipment-status';

interface Booking {
  id: string;
  status: string;
  title: string;
  description: string;
  href: string;
  actionLabel: string;
  type: 'QUOTE' | 'BOOKING' | 'INVOICE';
}

interface NotificationItem {
  id: string;
  type: string;
  payload: { title?: string; description?: string; href?: string };
  readAt: string | null;
}

interface ActionRow {
  id: string;
  type: 'QUOTE' | 'BOOKING' | 'INVOICE';
  title: string;
  meta: string;
  href: string;
  actionLabel: string;
  tone: 'success' | 'warning' | 'danger' | 'info' | 'neutral';
}

interface ShipmentRow {
  id: string;
  shipmentNo: string;
  status: string;
  polCode: string;
  podCode: string;
  eta: string | null;
}

interface DashboardResponse {
  stats: {
    pendingQuotes: number;
    actionBookings: number;
    activeShipments: number;
    issuedInvoices: number;
    unreadNotifications: number;
  };
  actions: Booking[];
  recentShipments: ShipmentRow[];
  notifications: NotificationItem[];
}

export default function PortalPage() {
  const { apiFetch } = useAuth();
  const [dashboard, setDashboard] = useState<DashboardResponse | null>(null);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const response = await apiFetch('/api/v1/dashboard/portal');
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

  const actions = useMemo<ActionRow[]>(() => {
    return (dashboard?.actions ?? []).map((action) => ({
      id: action.id,
      type: action.type,
      title: action.title,
      meta: action.description,
      href: action.href,
      actionLabel: action.actionLabel,
      tone:
        action.type === 'QUOTE'
          ? 'warning'
          : action.type === 'BOOKING' && action.status === 'REVISION_REQUIRED'
            ? 'warning'
            : 'info',
    }));
  }, [dashboard]);

  const unread = notifications.filter((item) => !item.readAt);
  const activeShipments = dashboard?.recentShipments ?? [];
  const statsData = dashboard?.stats ?? {
    pendingQuotes: 0,
    actionBookings: 0,
    activeShipments: 0,
    issuedInvoices: 0,
    unreadNotifications: 0,
  };
  const stats = [
    { label: '待处理 Quote', value: statsData.pendingQuotes, href: '/portal/quotes?status=pending' },
    { label: '待处理 Booking', value: statsData.actionBookings, href: '/portal/bookings?status=REVISION_REQUIRED' },
    { label: '进行中 Shipment', value: statsData.activeShipments, href: '/portal/shipments?status=DEPARTED' },
    { label: '待确认账单', value: statsData.issuedInvoices, href: '/portal/billing' },
  ];

  return (
    <div className="space-y-5">
      <PageHeader
        description="查看需要处理的订舱资料、在途 Shipment、账单和关键通知。"
        eyebrow="客户门户"
        title="仪表盘"
        actions={
          <Link className="inline-flex h-9 items-center rounded bg-primary px-4 text-sm font-semibold text-surface hover:bg-primary/90 focus:outline-none focus:ring-2 focus:ring-primary/20" href="/portal/rates">
            查询运价
          </Link>
        }
      />

      {loading ? (
        <LoadingState rows={8} />
      ) : error ? (
        <ErrorState description={error} onRetry={() => void load()} />
      ) : (
        <>
          <section className="grid gap-3 xl:grid-cols-4">
            {stats.map((stat) => (
              <Link className="block min-h-24 rounded border border-border bg-surface p-4 transition hover:border-primary/30 hover:bg-sidebar" href={stat.href} key={stat.label}>
                <p className="text-xs font-medium text-muted">{stat.label}</p>
                <div className="mt-3 text-2xl font-semibold">{stat.value}</div>
              </Link>
            ))}
          </section>

          <section className="grid gap-5 xl:grid-cols-[1.35fr_1fr]">
            <div className="rounded border border-border bg-surface">
              <div className="border-b border-border px-4 py-3">
                <h2 className="text-sm font-semibold">近期 Shipment</h2>
              </div>
              {activeShipments.length ? (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[680px] text-left text-sm">
                    <thead>
                      <tr className="border-b border-border bg-sidebar text-xs text-muted">
                        <th className={head}>Shipment</th>
                        <th className={head}>航线</th>
                        <th className={head}>ETA</th>
                        <th className={head}>状态</th>
                      </tr>
                    </thead>
                    <tbody>
                      {activeShipments.slice(0, 8).map((shipment) => (
                        <tr className="border-b border-border" key={shipment.id}>
                          <td className={cell}>
                            <Link className="font-semibold text-primary hover:underline" href={`/portal/shipments/${shipment.id}`}>
                              {shipment.shipmentNo}
                            </Link>
                          </td>
                          <td className={cell}>{shipment.polCode} → {shipment.podCode}</td>
                          <td className={cell}>{formatDate(shipment.eta, '待确认')}</td>
                          <td className={cell}>
                            <StatusBadge tone={shipmentStatusTone(shipment.status)}>
                              {shipmentStatusLabel(shipment.status, 'portal')}
                            </StatusBadge>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="p-4">
                  <EmptyState title="当前没有进行中的 Shipment" description="SO 发布并创建 Shipment 后，运输状态会显示在这里。" />
                </div>
              )}
            </div>

            <div className="space-y-5">
              <div className="rounded border border-border bg-surface">
                <div className="border-b border-border px-4 py-3">
                  <h2 className="text-sm font-semibold">待处理事项</h2>
                </div>
                {actions.length ? (
                  <div className="divide-y divide-border">
                    {actions.map((action) => (
                      <Link className="block px-4 py-3 transition hover:bg-sidebar" href={action.href} key={action.id}>
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="truncate text-sm font-medium">{action.title}</p>
                            <p className="mt-1 text-xs text-muted">{action.meta}</p>
                          </div>
                          <StatusBadge tone={action.tone}>{action.actionLabel}</StatusBadge>
                        </div>
                      </Link>
                    ))}
                  </div>
                ) : (
                  <div className="p-4">
                    <EmptyState title="当前没有待处理事项" description="待确认或待创建订舱的 Quote、需要补充的 Booking 和待确认账单会集中显示在这里。" />
                  </div>
                )}
              </div>

              <div className="rounded border border-border bg-surface" id="notifications">
                <div className="border-b border-border px-4 py-3">
                  <h2 className="text-sm font-semibold">未读通知</h2>
                </div>
                {unread.length ? (
                  <div className="divide-y divide-border">
                    {unread.slice(0, 5).map((item) => (
                      <Link className="block px-4 py-3 transition hover:bg-sidebar" href={item.payload.href ?? '/portal'} key={item.id}>
                        <p className="text-sm font-medium">{item.payload.title ?? item.type}</p>
                        <p className="mt-1 line-clamp-2 text-xs leading-5 text-muted">{item.payload.description ?? '有一条新的业务通知。'}</p>
                      </Link>
                    ))}
                  </div>
                ) : (
                  <div className="p-4">
                    <EmptyState title="当前没有未读通知" description="SO 发布、Shipment 更新和 Booking 补充提醒会显示在这里。" />
                  </div>
                )}
              </div>
            </div>
          </section>
        </>
      )}
    </div>
  );
}

const head = 'px-4 py-3 font-semibold';
const cell = 'px-4 py-3 align-middle';
