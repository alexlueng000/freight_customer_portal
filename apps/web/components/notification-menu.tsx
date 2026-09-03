'use client';

import { Bell } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '@/components/auth-provider';
import { formatDateTime } from '@/lib/date-time';
import { cn } from '@/lib/utils';

interface NotificationPayload {
  title?: string;
  description?: string;
  href?: string;
  bookingNo?: string;
  shipmentNo?: string;
  invoiceNo?: string;
}

interface NotificationItem {
  id: string;
  type: string;
  payload: NotificationPayload;
  readAt: string | null;
  createdAt: string;
}

const typeCopy: Record<
  string,
  { title: string; actionLabel: string; href: (payload: NotificationPayload) => string }
> = {
  SO_PUBLISHED: {
    title: 'SO 已发布',
    actionLabel: '查看 Booking',
    href: (payload) => payload.href ?? '/portal/bookings?status=BOOKED',
  },
  SHIPMENT_CREATED: {
    title: 'Shipment 已创建',
    actionLabel: '查看 Shipment',
    href: (payload) => payload.href ?? '/portal/shipments',
  },
  SHIPMENT_DEPARTED: {
    title: 'Shipment 已开船',
    actionLabel: '查看货踪',
    href: (payload) => payload.href ?? '/portal/shipments?status=DEPARTED',
  },
  SHIPMENT_ARRIVED: {
    title: 'Shipment 已到港',
    actionLabel: '查看货踪',
    href: (payload) => payload.href ?? '/portal/shipments?status=ARRIVED',
  },
  BOOKING_NEEDS_UPDATE: {
    title: 'Booking 资料需要补充',
    actionLabel: '继续填写',
    href: (payload) => payload.href ?? '/portal/bookings?status=REVISION_REQUIRED',
  },
  INVOICE_ISSUED: {
    title: 'Invoice 已发布',
    actionLabel: '查看账单',
    href: (payload) => payload.href ?? '/portal/billing',
  },
};

export function NotificationMenu({ className }: { className?: string }) {
  const { apiFetch, initialized, user } = useAuth();
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [loading, setLoading] = useState(false);
  const unreadCount = useMemo(() => items.filter((item) => !item.readAt).length, [items]);

  useEffect(() => {
    if (!initialized || !user) return;
    let active = true;
    setLoading(true);
    void apiFetch('/api/v1/notifications')
      .then(async (response) => {
        const payload = (await response.json().catch(() => [])) as NotificationItem[];
        if (active && response.ok) setItems(payload);
      })
      .catch(() => undefined)
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [apiFetch, initialized, user]);

  const markRead = async (item: NotificationItem) => {
    setOpen(false);
    if (item.readAt) return;
    setItems((current) =>
      current.map((candidate) =>
        candidate.id === item.id ? { ...candidate, readAt: new Date().toISOString() } : candidate,
      ),
    );
    await apiFetch(`/api/v1/notifications/${item.id}/read`, { method: 'POST' }).catch(
      () => undefined,
    );
  };

  return (
    <div className={cn('relative', className)}>
      <button
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-label={unreadCount ? `${unreadCount} 条未读通知` : '通知'}
        className="relative grid size-9 place-items-center rounded border border-border bg-surface text-muted hover:text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20"
        onClick={() => setOpen((value) => !value)}
        type="button"
      >
        <Bell aria-hidden className="size-4" />
        {unreadCount ? (
          <span className="absolute right-1.5 top-1.5 grid min-w-4 place-items-center rounded-full bg-danger px-1 text-[10px] font-bold leading-4 text-surface">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        ) : null}
      </button>
      {open ? (
        <div
          aria-label="通知"
          className="absolute right-0 top-11 z-50 w-[min(360px,calc(100vw-24px))] overflow-hidden rounded border border-border bg-surface shadow-xl"
          role="dialog"
        >
          <div className="border-b border-border px-4 py-3">
            <div className="text-sm font-semibold">通知</div>
            <div className="mt-1 text-xs text-muted">关键节点会直达对应业务对象。</div>
          </div>
          {loading ? (
            <div className="space-y-2 p-4">
              {[0, 1, 2].map((index) => (
                <div className="h-14 animate-pulse rounded bg-sidebar" key={index} />
              ))}
            </div>
          ) : items.length ? (
            <div className="max-h-[440px] divide-y divide-border overflow-auto">
              {items.map((item) => {
                const copy = typeCopy[item.type] ?? {
                  title: '新通知',
                  actionLabel: '查看详情',
                  href: (payload: NotificationPayload) => payload.href ?? '/portal',
                };
                const title = item.payload.title ?? copy.title;
                const description =
                  item.payload.description ??
                  item.payload.bookingNo ??
                  item.payload.shipmentNo ??
                  item.payload.invoiceNo ??
                  '有一条新的业务通知。';
                return (
                  <Link
                    className="block px-4 py-3 hover:bg-sidebar focus:outline-none focus:ring-2 focus:ring-inset focus:ring-primary/20"
                    href={copy.href(item.payload)}
                    key={item.id}
                    onClick={() => void markRead(item)}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          {!item.readAt ? (
                            <span className="size-2 rounded-full bg-primary" aria-label="未读" />
                          ) : null}
                          <p className="truncate text-sm font-semibold">{title}</p>
                        </div>
                        <p className="mt-1 line-clamp-2 text-xs leading-5 text-muted">
                          {description}
                        </p>
                      </div>
                      <span className="shrink-0 text-xs text-muted">
                        {formatDateTime(item.createdAt)}
                      </span>
                    </div>
                    <div className="mt-2 text-xs font-semibold text-primary">
                      {copy.actionLabel} →
                    </div>
                  </Link>
                );
              })}
            </div>
          ) : (
            <div className="px-4 py-6 text-sm text-muted">暂无未处理通知。</div>
          )}
        </div>
      ) : null}
    </div>
  );
}
