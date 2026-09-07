'use client';

import Link from 'next/link';
import { Check, PackageCheck, Ship, Anchor } from 'lucide-react';
import { useParams } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAuth } from '@/components/auth-provider';
import { BusinessFlow } from '@/components/business-flow';
import { ErrorState } from '@/components/error-state';
import { LoadingState } from '@/components/loading-state';
import { PageHeader } from '@/components/page-header';
import type { Shipment } from '@/components/shipment-types';
import { StatusBadge } from '@/components/status-badge';
import { hasPermission } from '@/lib/auth';
import { resolveShipmentBusinessFlow } from '@/lib/business-flow';
import { formatContainerSummary, formatDateTime, formatRouteSummary } from '@/lib/formatters';
import {
  shipmentStatusDescription,
  shipmentStatusLabel,
  shipmentStatusTone,
} from '@/lib/shipment-status';

export function ShipmentDetailPage({ mode }: { mode: 'admin' | 'portal' }) {
  const { id } = useParams<{ id: string }>();
  const { apiFetch, user } = useAuth();
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
  const containerSummary = formatContainerSummary(shipment.booking.containerRequests);
  const routeNames = shipment.booking.quote?.sourceRate;
  const canManage = mode === 'admin' && hasPermission(user, 'shipment.manage');
  const businessFlow = resolveShipmentBusinessFlow(shipment, mode);
  const actionWarning =
    action === 'depart' && shipment.etd && occurredAt && new Date(occurredAt) < new Date(shipment.etd)
      ? '实际开船时间早于计划 ETD，请确认时间是否正确。'
      : action === 'arrive' && shipment.atd && occurredAt && new Date(occurredAt) < new Date(shipment.atd)
        ? '实际到港时间早于实际开船时间，请确认时间是否正确。'
        : '';

  return (
    <div className="space-y-5">
      <Link className="text-sm text-primary hover:underline" href={`/${mode}/shipments`}>
        ← 返回 Shipment 列表
      </Link>
      <PageHeader
        eyebrow={shipment.customer.name}
        title={shipment.shipmentNo}
        description={formatRouteSummary(shipment.polCode, shipment.podCode, routeNames?.polName, routeNames?.podName)}
        actions={
          <StatusBadge tone={shipmentStatusTone(shipment.status)}>
            {shipmentStatusLabel(shipment.status, mode)}
          </StatusBadge>
        }
      />
      <BusinessFlow {...businessFlow} />
      {error ? <div className="rounded border border-danger/20 bg-danger/10 px-4 py-3 text-sm text-danger">{error}</div> : null}
      {notice ? <div className="rounded border border-success/20 bg-success/10 px-4 py-3 text-sm text-success">{notice}</div> : null}

      <section className="grid gap-4 rounded border border-border bg-surface p-5 sm:grid-cols-2 lg:grid-cols-4">
        {routeNames ? <Fact label="航线代码" value={`${shipment.polCode} → ${shipment.podCode}`} /> : null}
        <Fact label="船司" value={shipment.carrierCode ?? '待确认'} />
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
          <div>
            <h2 className="text-lg font-semibold">运输进度</h2>
            <p className="mt-1 text-sm text-muted">{shipmentStatusDescription(shipment.status, mode)}</p>
          </div>
          {canManage && nextAction ? (
            <button className={primary} disabled={busy} onClick={() => beginAction(nextAction.key)}>{busy ? '处理中...' : nextAction.label}</button>
          ) : null}
        </div>
        <ol aria-label="运输节点" className="mt-7 grid gap-0 sm:grid-cols-3">
          {basicTimeline(shipment).map((item, index) => {
            const Icon = item.icon;
            return (
              <li aria-current={item.current ? 'step' : undefined} className="relative flex gap-4 pb-7 last:pb-0 sm:block sm:pb-0" key={item.key}>
                {index < 2 ? <span aria-hidden="true" className={`absolute left-5 top-10 h-[calc(100%-2.5rem)] w-px sm:left-10 sm:top-5 sm:h-px sm:w-[calc(100%-2.5rem)] ${item.connected ? 'bg-primary/40' : 'bg-border'}`} /> : null}
                <span aria-hidden="true" className={`relative z-10 flex size-10 shrink-0 items-center justify-center rounded-full border ${item.current ? 'border-primary bg-primary text-surface ring-4 ring-primary/10' : item.done ? 'border-primary/25 bg-primary/10 text-primary' : 'border-border bg-surface text-muted'}`}>
                  {item.done && !item.current ? <Check className="size-5" /> : <Icon className="size-5" />}
                </span>
                <div className="min-w-0 sm:mt-4 sm:pr-5">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={`font-semibold ${item.current ? 'text-primary' : 'text-foreground'}`}>{item.label}</span>
                    <span className={`text-xs ${item.current ? 'text-primary' : 'text-muted'}`}>{item.current ? '当前阶段' : item.done ? '已完成' : shipment.status === 'CANCELLED' ? '已停止' : '待完成'}</span>
                  </div>
                  <div className="mt-1 text-sm tabular-nums text-muted">{item.time}</div>
                </div>
              </li>
            );
          })}
        </ol>
      </section>

      <section className="rounded border border-border bg-surface p-5">
        <div className="flex items-center justify-between gap-3">
          <h2 className="font-semibold">航程计划</h2>
          {canManage && !editing ? <button className={secondary} onClick={() => { setNotice(''); setEditing(true); }}>编辑航程计划</button> : null}
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
            <Fact label="预计开船 · ETD" value={formatDateTime(shipment.etd, '待确认')} />
            <Fact label="预计到港 · ETA" value={formatDateTime(shipment.eta, '待确认')} />
          </div>
        )}
      </section>

      {action ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div role="dialog" aria-label={action === 'depart' ? '确认已开船' : '确认已到港'} className="w-full max-w-md rounded bg-surface p-5 shadow-xl">
            <h2 className="font-semibold">{action === 'depart' ? '确认已开船' : '确认已到港'}</h2>
            <div className="mt-4 space-y-3">
              <Input label={action === 'depart' ? '实际开船时间 *' : '实际到港时间 *'} type="datetime-local" value={occurredAt} onChange={setOccurredAt} />
              {actionWarning ? (
                <div className="rounded border border-warning/30 bg-warning/10 px-3 py-2 text-sm text-foreground">
                  {actionWarning}
                </div>
              ) : null}
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

function basicTimeline(shipment: Shipment) {
  const rank = shipment.status === 'ARRIVED' ? 2 : shipment.status === 'DEPARTED' ? 1 : shipment.status === 'CANCELLED' ? -1 : 0;
  return [
    { key: 'booked', label: '已订舱', icon: PackageCheck, time: formatDateTime(shipment.booking.bookedAt, '订舱时间未记录'), done: rank >= 0, current: rank === 0, connected: rank >= 1 },
    { key: 'departed', label: shipment.atd ? '已开船' : '开船', icon: Ship, time: shipment.atd ? `实际开船 ${dateTime(shipment.atd)}` : '等待开船确认', done: !!shipment.atd, current: rank === 1, connected: rank >= 2 },
    { key: 'arrived', label: shipment.ata ? '已到港' : '到港', icon: Anchor, time: shipment.ata ? `实际到港 ${dateTime(shipment.ata)}` : '等待到港确认', done: !!shipment.ata, current: rank === 2, connected: false },
  ];
}
