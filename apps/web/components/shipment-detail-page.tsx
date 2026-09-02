'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAuth } from '@/components/auth-provider';
import { ErrorState } from '@/components/error-state';
import { LoadingState } from '@/components/loading-state';
import { PageHeader } from '@/components/page-header';
import type { Shipment } from '@/components/shipment-types';
import { StatusBadge } from '@/components/status-badge';
import type { StatusTone } from '@/lib/mock-data';
import { formatDateTime } from '@/lib/date-time';

export function ShipmentDetailPage({ mode }: { mode: 'admin' | 'portal' }) {
  const { id } = useParams<{ id: string }>();
  const { apiFetch } = useAuth();
  const [shipment, setShipment] = useState<Shipment | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [editing, setEditing] = useState(false);
  const [action, setAction] = useState<'depart' | 'arrive' | null>(null);
  const [occurredAt, setOccurredAt] = useState('');
  const [remark, setRemark] = useState('');
  const [details, setDetails] = useState({ vessel: '', voyage: '', etd: '', eta: '' });

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const response = await apiFetch(`/api/v1/shipments/${id}`);
      const payload = (await response.json()) as Shipment & { message?: string };
      if (!response.ok) throw new Error(payload.message ?? 'Shipment 详情加载失败。');
      setShipment(payload);
      setDetails({
        vessel: payload.vessel ?? '',
        voyage: payload.voyage ?? '',
        etd: localDateTime(payload.etd),
        eta: localDateTime(payload.eta),
      });
    } catch (reason) {
      setError((reason as Error).message);
    } finally {
      setLoading(false);
    }
  }, [apiFetch, id]);
  useEffect(() => void load(), [load]);

  const detailsDirty = useMemo(
    () =>
      !!shipment &&
      (details.vessel !== (shipment.vessel ?? '') ||
        details.voyage !== (shipment.voyage ?? '') ||
        details.etd !== localDateTime(shipment.etd) ||
        details.eta !== localDateTime(shipment.eta)),
    [details, shipment],
  );

  const request = async (path: string, body: object, method = 'POST') => {
    setBusy(true);
    setError('');
    try {
      const response = await apiFetch(`/api/v1/shipments/${id}${path}`, {
        method,
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
      const payload = (await response.json()) as { message?: string };
      if (!response.ok) throw new Error(payload.message ?? '操作失败。');
      await load();
      return true;
    } catch (reason) {
      setError((reason as Error).message);
      return false;
    } finally {
      setBusy(false);
    }
  };

  const beginAction = (value: 'depart' | 'arrive') => {
    setAction(value);
    setOccurredAt(localDateTime(new Date().toISOString()));
    setRemark('');
  };
  const confirmAction = async () => {
    if (!shipment || !action || !occurredAt) return;
    const actual = new Date(occurredAt);
    if (
      action === 'depart' &&
      shipment.etd &&
      actual < new Date(shipment.etd) &&
      !window.confirm('实际开船时间早于计划 ETD，请确认时间是否正确。')
    )
      return;
    const ok = await request(`/${action}`, { occurredAt: actual.toISOString(), remark });
    if (ok) setAction(null);
  };
  const saveDetails = async () => {
    const ok = await request(
      '',
      { ...details, etd: toIso(details.etd), eta: toIso(details.eta) },
      'PATCH',
    );
    if (ok) {
      setEditing(false);
      setNotice('航程计划已保存');
    }
  };

  if (loading) return <LoadingState rows={8} />;
  if (!shipment)
    return <ErrorState description={error || 'Shipment 不存在'} onRetry={() => void load()} />;

  const nextAction =
    shipment.status === 'PLANNED'
      ? { key: 'depart' as const, label: '标记已开船' }
      : shipment.status === 'DEPARTED'
        ? { key: 'arrive' as const, label: '标记已到港' }
        : null;
  const containerSummary = shipment.booking.containerRequests
    .map((item) => `${item.quantity} × ${item.containerType}`)
    .join('，');
  const routeNames = shipment.booking.quote?.sourceRate;

  return (
    <div className="space-y-5">
      <Link className="text-sm text-primary hover:underline" href={`/${mode}/shipments`}>
        ← 返回 Shipment 列表
      </Link>
      <PageHeader
        eyebrow={shipment.customer.name}
        title={shipment.shipmentNo}
        description={routeNames ? `${routeNames.polName} → ${routeNames.podName}` : `${shipment.polCode} → ${shipment.podCode}`}
        actions={
          <StatusBadge tone={shipmentStatusTone(shipment.status)}>
            {shipmentStatusLabel(shipment.status, mode)}
          </StatusBadge>
        }
      />
      {error ? <div className="rounded border border-danger/20 bg-danger/10 px-4 py-3 text-sm text-danger">{error}</div> : null}
      {notice ? <div className="rounded border border-success/20 bg-success/10 px-4 py-3 text-sm text-success">{notice}</div> : null}

      <section className="grid gap-4 rounded border border-border bg-surface p-5 sm:grid-cols-3">
        {routeNames ? <Fact label="航线代码" value={`${shipment.polCode} → ${shipment.podCode}`} /> : null}
        <Fact label="船司 · 船名 / 航次" value={`${shipment.carrierCode ?? '—'} · ${shipment.vessel ?? '待确认'} / ${shipment.voyage ?? '—'}`} />
        <Fact label="ETD / ETA" value={`${dateTime(shipment.etd)} / ${dateTime(shipment.eta)}`} />
        <Fact label="箱型与数量" value={containerSummary || '—'} />
        <div>
          <div className="text-xs text-muted">来源 Booking</div>
          <Link className="mt-1 inline-block font-semibold text-primary hover:underline" href={`/${mode}/bookings/${shipment.bookingId}`}>
            {shipment.booking.bookingNo} →
          </Link>
        </div>
      </section>

      <section className="rounded border border-border bg-surface p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="font-semibold">运输进度</h2>
          {mode === 'admin' && nextAction ? (
            <button className={primary} disabled={busy} onClick={() => beginAction(nextAction.key)}>{nextAction.label}</button>
          ) : null}
        </div>
        <ol className="mt-5 space-y-4 border-l-2 border-border pl-5">
          {basicTimeline(shipment).map((item) => (
            <li className="relative" key={item.key}>
              <span className={`absolute -left-[27px] top-1 size-3 rounded-full ${item.done ? 'bg-primary' : 'bg-border'}`} />
              <div className="font-semibold">{item.done ? '✓ ' : '○ '}{item.label}</div>
              <div className="text-sm text-muted">{item.time}</div>
            </li>
          ))}
        </ol>
      </section>

      <section className="rounded border border-border bg-surface p-5">
        <div className="flex items-center justify-between gap-3">
          <h2 className="font-semibold">航程计划</h2>
          {mode === 'admin' && !editing ? <button className={secondary} onClick={() => { setNotice(''); setEditing(true); }}>编辑航程计划</button> : null}
        </div>
        {editing ? (
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <Input label="船名" value={details.vessel} onChange={(value) => setDetails({ ...details, vessel: value })} />
            <Input label="航次" value={details.voyage} onChange={(value) => setDetails({ ...details, voyage: value })} />
            <Input label="ETD" type="datetime-local" value={details.etd} onChange={(value) => setDetails({ ...details, etd: value })} />
            <Input label="ETA" type="datetime-local" value={details.eta} onChange={(value) => setDetails({ ...details, eta: value })} />
            <div className="flex gap-2 sm:col-span-2">
              <button className={primary} disabled={busy || !detailsDirty} onClick={() => void saveDetails()}>保存航程计划</button>
              <button className={secondary} disabled={busy} onClick={() => { setEditing(false); setDetails({ vessel: shipment.vessel ?? '', voyage: shipment.voyage ?? '', etd: localDateTime(shipment.etd), eta: localDateTime(shipment.eta) }); }}>取消</button>
            </div>
          </div>
        ) : (
          <div className="mt-4 grid gap-4 sm:grid-cols-4">
            <Fact label="船名" value={shipment.vessel ?? '—'} />
            <Fact label="航次" value={shipment.voyage ?? '—'} />
            <Fact label="ETD" value={dateTime(shipment.etd)} />
            <Fact label="ETA" value={dateTime(shipment.eta)} />
            <Fact label="实际开船" value={dateTime(shipment.atd)} />
            <Fact label="实际到港" value={dateTime(shipment.ata)} />
          </div>
        )}
      </section>

      {action ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div role="dialog" aria-label={action === 'depart' ? '确认已开船' : '确认已到港'} className="w-full max-w-md rounded bg-surface p-5 shadow-xl">
            <h2 className="font-semibold">{action === 'depart' ? '确认已开船' : '确认已到港'}</h2>
            <div className="mt-4 space-y-3">
              <Input label={action === 'depart' ? '实际开船时间 *' : '实际到港时间 *'} type="datetime-local" value={occurredAt} onChange={setOccurredAt} />
              <Input label="备注（选填）" value={remark} onChange={setRemark} />
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button className={secondary} disabled={busy} onClick={() => setAction(null)}>取消</button>
              <button className={primary} disabled={busy || !occurredAt} onClick={() => void confirmAction()}>{action === 'depart' ? '确认已开船' : '确认已到港'}</button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function Input({ label, value, onChange, type = 'text' }: { label: string; value: string; onChange: (value: string) => void; type?: string }) {
  return <label className="text-sm"><span className="mb-1 block font-medium">{label}</span><input className={inputClass} type={type} value={value} onChange={(event) => onChange(event.target.value)} /></label>;
}
function Fact({ label, value }: { label: string; value: string }) {
  return <div><div className="text-xs text-muted">{label}</div><div className="mt-1 font-semibold">{value}</div></div>;
}
const toIso = (value: string) => (value ? new Date(value).toISOString() : undefined);
const localDateTime = (value: string | null) => value ? new Date(value).toISOString().slice(0, 16) : '';
const dateTime = formatDateTime;
const primary = 'h-9 rounded bg-primary px-4 text-sm font-semibold text-surface disabled:opacity-40';
const secondary = 'h-9 rounded border border-border bg-surface px-4 text-sm font-semibold disabled:opacity-40';
const inputClass = 'h-9 w-full rounded border border-border bg-surface px-3 text-sm';

function shipmentStatusLabel(status: string, mode: 'admin' | 'portal') {
  return ({ PLANNED: mode === 'portal' ? '待开船' : '待开船', DEPARTED: mode === 'portal' ? '运输中' : '已开船', ARRIVED: '已到港', CANCELLED: '已取消' }[status] ?? status);
}
function shipmentStatusTone(status: string): StatusTone {
  if (status === 'ARRIVED') return 'success';
  if (status === 'CANCELLED') return 'danger';
  if (status === 'DEPARTED') return 'info';
  return 'neutral';
}
function basicTimeline(shipment: Shipment) {
  const rank = shipment.status === 'ARRIVED' ? 2 : shipment.status === 'DEPARTED' ? 1 : shipment.status === 'CANCELLED' ? -1 : 0;
  return [
    { key: 'booked', label: '已订舱', time: dateTime(shipment.booking.bookedAt), done: rank >= 0 },
    { key: 'departed', label: '已开船', time: shipment.atd ? dateTime(shipment.atd) : `预计 ${dateTime(shipment.etd)}`, done: rank >= 1 },
    { key: 'arrived', label: '已到港', time: shipment.ata ? dateTime(shipment.ata) : `预计 ${dateTime(shipment.eta)}`, done: rank >= 2 },
  ];
}
