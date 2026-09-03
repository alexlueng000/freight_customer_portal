'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAuth } from '@/components/auth-provider';
import { EmptyState } from '@/components/empty-state';
import { ErrorState } from '@/components/error-state';
import { LoadingState } from '@/components/loading-state';
import { PageHeader } from '@/components/page-header';
import type { Shipment } from '@/components/shipment-types';
import { StatusBadge } from '@/components/status-badge';
import { formatContainerSummary, formatDate } from '@/lib/formatters';
import { shipmentStatusLabel, shipmentStatusTone } from '@/lib/shipment-status';

export function ShipmentListPage({ mode }: { mode: 'admin' | 'portal' }) {
  const searchParams = useSearchParams();
  const { apiFetch } = useAuth();
  const [items, setItems] = useState<Shipment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState(searchParams.get('status') ?? '');
  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const response = await apiFetch('/api/v1/shipments');
      const payload = (await response.json()) as Shipment[] & { message?: string };
      if (!response.ok) throw new Error(payload.message ?? 'Shipment 列表加载失败。');
      setItems(payload);
    } catch (reason) {
      setError((reason as Error).message);
    } finally {
      setLoading(false);
    }
  }, [apiFetch]);
  useEffect(() => void load(), [load]);
  const visible = useMemo(() => {
    const keyword = query.trim().toLowerCase();
    return items.filter(
      (item) =>
        (!status || item.status === status) &&
        (!keyword ||
          [item.shipmentNo, item.booking.bookingNo, item.customer.name, item.polCode, item.podCode]
            .join(' ')
            .toLowerCase()
            .includes(keyword)),
    );
  }, [items, query, status]);
  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow={mode === 'admin' ? '运营后台' : '客户门户'}
        title="Basic Shipment"
        description={
          mode === 'admin'
            ? '维护 SO 后的基础出运信息、船期时间与客户可见进度。'
            : '查看已订舱后的船名航次、预计时间和基础进度。'
        }
      />
      <section className="overflow-hidden rounded border border-border bg-surface">
        <div className="flex flex-col gap-3 border-b border-border p-4 sm:flex-row">
          <input
            className={control}
            placeholder="搜索 Shipment、Booking、客户或航线"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
          <select
            className={control}
            value={status}
            onChange={(event) => setStatus(event.target.value)}
          >
            <option value="">全部状态</option>
            {[
              'PLANNED',
              'DEPARTED',
              'ARRIVED',
              'CANCELLED',
            ].map((value) => (
              <option key={value} value={value}>
                {shipmentStatusLabel(value, mode)}
              </option>
            ))}
          </select>
        </div>
        {loading ? (
          <LoadingState rows={6} />
        ) : error ? (
          <div className="p-4">
            <ErrorState description={error} onRetry={() => void load()} />
          </div>
        ) : visible.length === 0 ? (
          <div className="p-4">
            <EmptyState
              title={status || query ? '没有匹配的 Shipment' : '还没有 Shipment'}
              description={status || query ? '请调整状态或关键词后重新查看。' : 'Booking 确认并发布 SO 后，系统会创建 Basic Shipment，你可以在这里查看运输进度。'}
            />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[920px] text-left text-sm">
              <thead>
                <tr className="border-b border-border bg-sidebar text-xs text-muted">
                  <th className={head}>Shipment</th>
                  <th className={head}>客户 / Booking</th>
                  <th className={head}>航线</th>
                  <th className={head}>船名航次</th>
                  <th className={head}>ETD / ETA</th>
                  <th className={head}>柜量</th>
                  <th className={head}>状态</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((item) => (
                  <tr className="border-b border-border" key={item.id}>
                    <td className={cell}>
                      <Link
                        className="font-semibold text-primary hover:underline"
                        href={`/${mode}/shipments/${item.id}`}
                      >
                        {item.shipmentNo}
                      </Link>
                    </td>
                    <td className={cell}>
                      {item.customer.name}
                      <div className="text-xs text-muted">{item.booking.bookingNo}</div>
                    </td>
                    <td className={cell}>
                      {item.polCode} → {item.podCode}
                    </td>
                    <td className={cell}>
                      {item.vessel ?? '待确认'}
                      <div className="text-xs text-muted">{item.voyage ?? '—'}</div>
                    </td>
                    <td className={cell}>
                      {formatDate(item.etd, '待确认')} / {formatDate(item.eta, '待确认')}
                    </td>
                    <td className={cell}>
                      {formatContainerSummary(item.booking.containerRequests)}
                    </td>
                    <td className={cell}>
                      <StatusBadge tone={shipmentStatusTone(item.status)}>
                        {shipmentStatusLabel(item.status, mode)}
                      </StatusBadge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
const control = 'h-9 rounded border border-border bg-surface px-3 text-sm sm:min-w-56';
const head = 'px-4 py-3 font-semibold';
const cell = 'px-4 py-3 align-middle';
