'use client';
import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '@/components/auth-provider';
import { EmptyState } from '@/components/empty-state';
import { ErrorState } from '@/components/error-state';
import { LoadingState } from '@/components/loading-state';
import { PageHeader } from '@/components/page-header';
import { StatusBadge } from '@/components/status-badge';
import { bookingStatusLabel, bookingStatusTone } from '@/lib/booking-status';
interface Booking {
  id: string;
  bookingNo: string;
  status: string;
  polCode: string;
  podCode: string;
  commodity: string | null;
  customer: { name: string };
  containerRequests: Array<{ containerType: string; quantity: number }>;
  createdAt: string;
}
export default function AdminBookingsPage() {
  const { apiFetch } = useAuth();
  const [items, setItems] = useState<Booking[]>([]);
  const [status, setStatus] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const q = status ? `&status=${status}` : '';
      const r = await apiFetch(`/api/v1/admin/bookings?page=1&pageSize=50${q}`);
      const p = (await r.json()) as { items?: Booking[]; message?: string };
      if (!r.ok) throw new Error(p.message ?? '订舱列表加载失败。');
      setItems(p.items ?? []);
    } catch (e) {
      setError((e as { message?: string }).message ?? '订舱列表加载失败。');
    } finally {
      setLoading(false);
    }
  }, [apiFetch, status]);
  useEffect(() => {
    void load();
  }, [load]);
  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="运营后台"
        title="订舱审核"
        description="审核客户提交的订舱并确认业务资料。"
      />
      <section className="overflow-hidden rounded border border-border bg-surface">
        <div className="border-b border-border p-4">
          <select
            className="h-9 rounded border border-border bg-surface px-3 text-sm"
            value={status}
            onChange={(e) => setStatus(e.target.value)}
          >
            <option value="">全部状态</option>
            {[
              'DRAFT',
              'SUBMITTED',
              'REVISION_REQUIRED',
              'APPROVED',
              'BOOKING_SUBMITTED',
              'BOOKED',
              'REJECTED',
              'CANCELLED',
            ].map((s) => (
              <option key={s} value={s}>
                {bookingStatusLabel(s)}
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
        ) : !items.length ? (
          <div className="p-4">
            <EmptyState title="暂无订舱" description="客户从已接受报价创建订舱后会显示在这里。" />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[850px] text-left text-sm">
              <thead>
                <tr className="border-b border-border bg-sidebar text-xs text-muted">
                  <th className={head}>订舱编号</th>
                  <th className={head}>客户</th>
                  <th className={head}>航线</th>
                  <th className={head}>货物/箱量</th>
                  <th className={head}>状态</th>
                  <th className={head}>创建时间</th>
                </tr>
              </thead>
              <tbody>
                {items.map((b) => (
                  <tr className="border-b border-border" key={b.id}>
                    <td className={cell}>
                      <Link
                        className="font-semibold text-primary hover:underline"
                        href={`/admin/bookings/${b.id}`}
                      >
                        {b.bookingNo}
                      </Link>
                    </td>
                    <td className={cell}>{b.customer.name}</td>
                    <td className={cell}>
                      {b.polCode} → {b.podCode}
                    </td>
                    <td className={cell}>
                      {b.commodity ?? '待填写'}
                      <div className="text-xs text-muted">
                        {b.containerRequests
                          .map((c) => `${c.containerType} × ${c.quantity}`)
                          .join(' / ')}
                      </div>
                    </td>
                    <td className={cell}>
                      <StatusBadge tone={bookingStatusTone(b.status)}>
                        {bookingStatusLabel(b.status)}
                      </StatusBadge>
                    </td>
                    <td className={cell}>{b.createdAt.slice(0, 10)}</td>
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
