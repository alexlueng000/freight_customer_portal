'use client';

import Link from 'next/link';
import { ArrowRight, ChevronDown, ChevronUp } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAuth } from '@/components/auth-provider';
import { EmptyState } from '@/components/empty-state';
import { ErrorState } from '@/components/error-state';
import { LoadingState } from '@/components/loading-state';
import { PageHeader } from '@/components/page-header';
import { StatusBadge } from '@/components/status-badge';
import { formatDate } from '@/lib/formatters';
import { shipmentStatusLabel, shipmentStatusTone } from '@/lib/shipment-status';
import { isPilotPathAvailable, isPilotNotificationAvailable } from '@/lib/pilot-scope';
import styles from './dashboard.module.css';

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
  const [showAllActions, setShowAllActions] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const response = await apiFetch('/api/v1/dashboard/portal');
      const payload = (await response.json()) as DashboardResponse & { message?: string };
      if (!response.ok) throw new Error(payload.message ?? '工作台加载失败。');
      setDashboard(payload);
      setNotifications(payload.notifications.filter(isPilotNotificationAvailable));
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
    return (dashboard?.actions ?? [])
      .filter((action) => isPilotPathAvailable(action.href))
      .map((action) => ({
        id: action.id,
        type: action.type,
        title: action.title,
        meta: action.description,
        href: action.href,
        actionLabel: action.actionLabel,
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
    {
      label: '待处理报价',
      value: statsData.pendingQuotes,
      href: '/portal/quotes?status=pending',
      description: '查看需要确认的报价',
      color: styles.quoteStat,
    },
    {
      label: '待处理订舱',
      value: statsData.actionBookings,
      href: '/portal/bookings',
      description: '含草稿与需补充资料的订舱 · 查看订舱',
      color: styles.bookingStat,
    },
    {
      label: '进行中运输',
      value: statsData.activeShipments,
      href: '/portal/shipments',
      description: '含待开船与运输中 · 查看运输',
      color: styles.shipmentStat,
    },
  ];

  return (
    <div className="space-y-5">
      <PageHeader
        description="查看待确认报价、待补充资料、运输进展和最新通知。"
        eyebrow="客户门户"
        title="首页"
        actions={
          <Link
            className="inline-flex h-9 items-center rounded bg-primary px-4 text-sm font-semibold text-surface hover:bg-primary/90 focus:outline-none focus:ring-2 focus:ring-primary/20"
            href="/portal/rates"
          >
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
          <section aria-label="业务概览" className="grid gap-3 sm:grid-cols-3">
            {stats.map((stat) => (
              <Link
                className={`${stat.color} block rounded border px-5 py-4 transition hover:brightness-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary`}
                href={stat.href}
                key={stat.label}
              >
                <div className="flex items-center justify-between gap-4">
                  <p className="text-sm font-medium">{stat.label}</p>
                  <span className="text-3xl font-semibold tabular-nums">{stat.value}</span>
                </div>
                <div className="mt-2 flex items-center justify-between gap-2 text-xs text-muted">
                  <span>{stat.description}</span>
                  <ArrowRight aria-hidden="true" className="h-4 w-4 shrink-0 text-primary" />
                </div>
              </Link>
            ))}
          </section>

          <section
            aria-label="待办与运输动态"
            className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.25fr)]"
          >
            <div className="min-w-0">
              <section
                aria-labelledby="pending-actions-heading"
                className={`${styles.pendingPanel} overflow-hidden rounded border bg-surface`}
              >
                <header className="border-b px-5 py-4">
                  <h2 id="pending-actions-heading" className="text-base font-semibold">
                    待处理事项
                  </h2>
                  <p className="mt-1 text-xs text-muted">
                    确认报价、创建订舱或补充资料，从这里继续。
                  </p>
                </header>
                {actions.length ? (
                  <div id="pending-actions-list" className="divide-y divide-border">
                    {(showAllActions ? actions : actions.slice(0, 5)).map((action) => (
                      <Link
                        className="group block px-5 py-4 transition hover:bg-sidebar focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary"
                        href={action.href}
                        key={`${action.type}-${action.id}`}
                      >
                        <div className="flex flex-wrap items-center justify-between gap-3">
                          <div className="min-w-0 flex-1 basis-56">
                            <p className="break-words text-sm font-semibold leading-6">
                              {action.title}
                            </p>
                            <p className="mt-1 text-xs leading-5 text-muted">{action.meta}</p>
                          </div>
                          <span
                            className={`${styles.actionLink} inline-flex min-h-9 shrink-0 items-center gap-2 rounded border px-3 text-sm font-medium`}
                          >
                            {action.actionLabel}
                            <ArrowRight aria-hidden="true" className="h-3.5 w-3.5" />
                          </span>
                        </div>
                      </Link>
                    ))}
                    {actions.length > 5 && (
                      <button
                        type="button"
                        aria-expanded={showAllActions}
                        aria-controls="pending-actions-list"
                        onClick={() => setShowAllActions((value) => !value)}
                        className="flex min-h-11 w-full items-center justify-center gap-2 px-5 py-3 text-sm font-medium text-primary hover:bg-sidebar focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary"
                      >
                        {showAllActions ? '收起待办' : `展开其余 ${actions.length - 5} 条待办`}
                        {showAllActions ? (
                          <ChevronUp aria-hidden="true" className="h-4 w-4" />
                        ) : (
                          <ChevronDown aria-hidden="true" className="h-4 w-4" />
                        )}
                      </button>
                    )}
                  </div>
                ) : (
                  <div className="p-4">
                    <EmptyState
                      title="当前没有待处理事项"
                      description="待确认报价、已接受但未订舱的报价和需要补充的订舱资料会显示在这里。"
                    />
                  </div>
                )}
                <div className="flex flex-wrap gap-x-5 gap-y-2 border-t border-border px-5 py-3 text-sm font-medium text-primary">
                  <Link className="hover:underline" href="/portal/quotes?status=pending">
                    查看待处理报价 →
                  </Link>
                  <Link className="hover:underline" href="/portal/bookings">
                    查看全部订舱 →
                  </Link>
                </div>
              </section>
            </div>
            <div className="min-w-0 space-y-5">
              <section
                aria-labelledby="recent-shipments-heading"
                className={`${styles.transportPanel} overflow-hidden rounded border bg-surface`}
              >
                <header className="flex flex-wrap items-center justify-between gap-3 border-b px-5 py-4">
                  <h2 id="recent-shipments-heading" className="text-base font-semibold">
                    近期运输
                  </h2>
                  <Link
                    className="text-sm font-medium text-primary hover:underline"
                    href="/portal/shipments"
                  >
                    查看全部运输 →
                  </Link>
                </header>
                {activeShipments.length ? (
                  <>
                    <div className="divide-y divide-border md:hidden">
                      {activeShipments.slice(0, 8).map((shipment) => (
                        <Link
                          className="block px-4 py-3 active:bg-sidebar"
                          href={`/portal/shipments/${shipment.id}`}
                          key={shipment.id}
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <div className="font-semibold text-primary">
                                {shipment.shipmentNo}
                              </div>
                              <div className="mt-1 text-sm">
                                {shipment.polCode} → {shipment.podCode}
                              </div>
                              <div className="mt-1 text-xs text-muted">
                                预计到港时间 {formatDate(shipment.eta, '待确认')}
                              </div>
                            </div>
                            <StatusBadge tone={shipmentStatusTone(shipment.status)}>
                              {shipmentStatusLabel(shipment.status, 'portal')}
                            </StatusBadge>
                          </div>
                        </Link>
                      ))}
                    </div>
                    <div className="hidden overflow-x-auto md:block">
                      <table className="w-full text-left text-sm">
                        <thead>
                          <tr className="border-b border-border bg-sidebar text-xs text-muted">
                            <th className={head}>运输编号</th>
                            <th className={head}>航线</th>
                            <th className={head}>预计到港时间</th>
                            <th className={head}>状态</th>
                          </tr>
                        </thead>
                        <tbody>
                          {activeShipments.slice(0, 8).map((shipment) => (
                            <tr className="border-b border-border" key={shipment.id}>
                              <td className={cell}>
                                <Link
                                  className="font-semibold text-primary hover:underline"
                                  href={`/portal/shipments/${shipment.id}`}
                                >
                                  {shipment.shipmentNo}
                                </Link>
                              </td>
                              <td className={cell}>
                                {shipment.polCode} → {shipment.podCode}
                              </td>
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
                  </>
                ) : (
                  <div className="p-4">
                    <EmptyState
                      title="当前没有运输记录"
                      description="货代建立运输记录后，开船与到港进展会显示在这里。"
                    />
                  </div>
                )}
              </section>

              <section
                aria-labelledby="notifications-heading"
                className={`${styles.notificationPanel} overflow-hidden rounded border bg-surface`}
                id="notifications"
              >
                <header className="border-b px-5 py-4">
                  <h2 id="notifications-heading" className="text-base font-semibold">
                    最新未读通知
                  </h2>
                </header>
                {unread.length ? (
                  <div className="divide-y divide-border">
                    {unread.slice(0, 3).map((item) => (
                      <Link
                        className="block px-5 py-3 transition hover:bg-sidebar focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary"
                        href={item.payload.href ?? '/portal'}
                        key={item.id}
                      >
                        <p className="text-sm font-medium">{item.payload.title ?? item.type}</p>
                        <p className="mt-1 line-clamp-2 text-xs leading-5 text-muted">
                          {item.payload.description ?? '有一条新的业务通知。'}
                        </p>
                      </Link>
                    ))}
                    {unread.length > 3 && (
                      <details className="group">
                        <summary className="cursor-pointer px-5 py-3 text-sm font-medium text-primary">
                          更多未读通知
                        </summary>
                        {unread.slice(3).map((item) => (
                          <Link
                            className="block border-t border-border px-5 py-3 hover:bg-sidebar"
                            href={item.payload.href ?? '/portal'}
                            key={item.id}
                          >
                            <p className="text-sm font-medium">{item.payload.title ?? item.type}</p>
                            <p className="mt-1 text-xs leading-5 text-muted">
                              {item.payload.description ?? '有一条新的业务通知。'}
                            </p>
                          </Link>
                        ))}
                      </details>
                    )}
                  </div>
                ) : (
                  <div className="p-5">
                    <EmptyState
                      title="当前没有未读通知"
                      description="订舱确认单发布、运输更新和订舱补料提醒会显示在这里。"
                    />
                  </div>
                )}
              </section>
            </div>
          </section>
        </>
      )}
    </div>
  );
}

const head = 'px-4 py-3 font-semibold';
const cell = 'px-4 py-3 align-middle';
