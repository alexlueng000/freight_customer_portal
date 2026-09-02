'use client';
import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '@/components/auth-provider';
import { EmptyState } from '@/components/empty-state';
import { ErrorState } from '@/components/error-state';
import { LoadingState } from '@/components/loading-state';
import { PageHeader } from '@/components/page-header';
import { StatusBadge } from '@/components/status-badge';
import { bookingStatusTone, customerBookingStatusLabel } from '@/lib/booking-status';

interface Booking {
  id: string;
  bookingNo: string;
  status: string;
  polCode: string;
  podCode: string;
  carrierCode: string | null;
  etd: string | null;
  commodity: string | null;
  containerRequests: Array<{ containerType: string; quantity: number }>;
}
export default function PortalBookingsPage() {
  const { apiFetch } = useAuth();
  const [items, setItems] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const r = await apiFetch('/api/v1/bookings?page=1&pageSize=50');
      const p = (await r.json()) as { items?: Booking[]; message?: string };
      if (!r.ok) throw new Error(p.message ?? '订舱列表加载失败。');
      setItems(p.items ?? []);
    } catch (e) {
      setError((e as { message?: string }).message ?? '订舱列表加载失败。');
    } finally {
      setLoading(false);
    }
  }, [apiFetch]);
  useEffect(() => {
    void load();
  }, [load]);
  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="客户门户"
        title="我的订舱"
        description="完善订舱资料、提交审核并跟踪确认状态。"
      />
      <section className="overflow-hidden rounded border border-border bg-surface">
        {loading ? (
          <LoadingState rows={6} />
        ) : error ? (
          <div className="p-4">
            <ErrorState description={error} onRetry={() => void load()} />
          </div>
        ) : !items.length ? (
          <div className="p-4">
            <EmptyState title="暂无订舱" description="接受报价后，可从报价详情一键创建订舱。" />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[800px] text-left text-sm">
              <thead>
                <tr className="border-b border-border bg-sidebar text-xs text-muted">
                  <th className={head}>订舱编号</th>
                  <th className={head}>航线</th>
                  <th className={head}>货物</th>
                  <th className={head}>箱量</th>
                  <th className={head}>状态</th>
                </tr>
              </thead>
              <tbody>
                {items.map((b) => (
                  <tr className="border-b border-border" key={b.id}>
                    <td className={cell}>
                      <Link
                        className="font-semibold text-primary hover:underline"
                        href={`/portal/bookings/${b.id}`}
                      >
                        {b.bookingNo}
                      </Link>
                    </td>
                    <td className={cell}>
                      {b.polCode} → {b.podCode}
                      <div className="text-xs text-muted">
                        {b.carrierCode ?? '船司待确认'} · {b.etd?.slice(0, 10) ?? 'ETD 待确认'}
                      </div>
                    </td>
                    <td className={cell}>{b.commodity ?? '待填写'}</td>
                    <td className={cell}>
                      {b.containerRequests
                        .map((c) => `${c.containerType} × ${c.quantity}`)
                        .join(' / ') || '待填写'}
                    </td>
                    <td className={cell}>
                      <StatusBadge tone={bookingStatusTone(b.status)}>
                        {customerBookingStatusLabel(b.status)}
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
const head = 'px-4 py-3 font-semibold';
const cell = 'px-4 py-3 align-middle';
