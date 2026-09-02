'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '@/components/auth-provider';
import { ErrorState } from '@/components/error-state';
import { LoadingState } from '@/components/loading-state';
import { PageHeader } from '@/components/page-header';
import type { Shipment, ShipmentDocument } from '@/components/shipment-types';
import { StatusBadge } from '@/components/status-badge';
import type { StatusTone } from '@/lib/mock-data';

export function ShipmentDetailPage({ mode }: { mode: 'admin' | 'portal' }) {
  const { id } = useParams<{ id: string }>();
  const { apiFetch } = useAuth();
  const [shipment, setShipment] = useState<Shipment | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [details, setDetails] = useState({
    vessel: '',
    voyage: '',
    etd: '',
    eta: '',
    mblNo: '',
    hblNo: '',
  });
  const [container, setContainer] = useState({
    containerNo: '',
    containerType: '40HQ',
    sealNo: '',
    vgmWeight: '',
  });
  const [event, setEvent] = useState({
    eventType: 'CONTAINER_GATED_IN',
    eventTime: '',
    locationCode: '',
    locationName: '',
    remark: '',
    customerVisible: true,
  });
  const [documentType, setDocumentType] = useState('DRAFT_BL');
  const [customerVisible, setCustomerVisible] = useState(false);
  const [file, setFile] = useState<File | null>(null);

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
        mblNo: payload.mblNo ?? '',
        hblNo: payload.hblNo ?? '',
      });
    } catch (reason) {
      setError((reason as Error).message);
    } finally {
      setLoading(false);
    }
  }, [apiFetch, id]);
  useEffect(() => void load(), [load]);

  const jsonAction = async (path: string, body: object, method = 'POST') => {
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
    } catch (reason) {
      setError((reason as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const upload = async () => {
    if (!file) return;
    setBusy(true);
    setError('');
    try {
      const form = new FormData();
      form.append('documentType', documentType);
      form.append('customerVisible', String(customerVisible));
      form.append('file', file);
      const response = await apiFetch(`/api/v1/shipments/${id}/documents`, {
        method: 'POST',
        body: form,
      });
      const payload = (await response.json()) as { message?: string };
      if (!response.ok) throw new Error(payload.message ?? '文件上传失败。');
      setFile(null);
      await load();
    } catch (reason) {
      setError((reason as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const download = async (document: ShipmentDocument) => {
    setError('');
    const response = await apiFetch(`/api/v1/documents/${document.id}/download`);
    if (!response.ok) {
      const payload = (await response.json()) as { message?: string };
      setError(payload.message ?? '文件下载失败。');
      return;
    }
    const url = URL.createObjectURL(await response.blob());
    const anchor = window.document.createElement('a');
    anchor.href = url;
    anchor.download = document.originalFilename;
    anchor.click();
    URL.revokeObjectURL(url);
  };
  if (loading) return <LoadingState rows={8} />;
  if (!shipment)
    return <ErrorState description={error || 'Shipment 不存在'} onRetry={() => void load()} />;
  const nextAction: Record<string, { path: string; label: string } | undefined> = {
    CREATED: { path: '/book', label: '确认已订舱' },
    BOOKED: { path: '/depart', label: '确认开船' },
    DEPARTED: { path: '/transit', label: '标记运输中' },
    IN_TRANSIT: { path: '/arrive', label: '确认到港' },
    ARRIVED: { path: '/complete', label: '完成 Shipment' },
  };
  const action = nextAction[shipment.status];
  return (
    <div className="space-y-5">
      <Link className="text-sm text-primary hover:underline" href={`/${mode}/shipments`}>
        ← 返回 Shipment 列表
      </Link>
      <PageHeader
        eyebrow={shipment.customer.name}
        title={shipment.shipmentNo}
        description={`Basic Shipment · ${shipment.polCode} → ${shipment.podCode}`}
        actions={
          mode === 'admin' && action ? (
            <button
              className={primary}
              disabled={busy}
              onClick={() => void jsonAction(action.path, {})}
            >
              {action.label}
            </button>
          ) : undefined
        }
      />
      {error ? (
        <div className="rounded border border-danger/20 bg-danger/10 px-4 py-3 text-sm text-danger">
          {error}
        </div>
      ) : null}
      <section className="grid gap-4 rounded border border-border bg-surface p-5 sm:grid-cols-4">
        <Fact label="状态">
          <StatusBadge tone={shipmentStatusTone(shipment.status)}>
            {shipmentStatusLabel(shipment.status)}
          </StatusBadge>
        </Fact>
        <Fact label="来源 Booking" value={shipment.booking.bookingNo} />
        <Fact label="船司" value={shipment.carrierCode ?? '—'} />
        <Fact label="当前进度" value={customerProgressLabel(shipment.status)} />
      </section>
      <section className="rounded border border-border bg-surface p-5">
        <h2 className="font-semibold">基础出运信息</h2>
        {mode === 'admin' ? (
          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            <Input
              label="船名"
              value={details.vessel}
              onChange={(value) => setDetails({ ...details, vessel: value })}
            />
            <Input
              label="航次"
              value={details.voyage}
              onChange={(value) => setDetails({ ...details, voyage: value })}
            />
            <Input
              label="ETD"
              type="datetime-local"
              value={details.etd}
              onChange={(value) => setDetails({ ...details, etd: value })}
            />
            <Input
              label="ETA"
              type="datetime-local"
              value={details.eta}
              onChange={(value) => setDetails({ ...details, eta: value })}
            />
            <Input
              label="MBL（参考）"
              value={details.mblNo}
              onChange={(value) => setDetails({ ...details, mblNo: value })}
            />
            <Input
              label="HBL（参考）"
              value={details.hblNo}
              onChange={(value) => setDetails({ ...details, hblNo: value })}
            />
            <button
              className={primary}
              disabled={busy}
              onClick={() =>
                void jsonAction(
                  '',
                  { ...details, etd: toIso(details.etd), eta: toIso(details.eta) },
                  'PATCH',
                )
              }
            >
              保存资料
            </button>
          </div>
        ) : (
          <div className="mt-4 grid gap-4 sm:grid-cols-4">
            <Fact
              label="船名/航次"
              value={`${shipment.vessel ?? '待确认'} / ${shipment.voyage ?? '—'}`}
            />
            <Fact label="ETD/ATD" value={`${dateTime(shipment.etd)} / ${dateTime(shipment.atd)}`} />
            <Fact label="ETA/ATA" value={`${dateTime(shipment.eta)} / ${dateTime(shipment.ata)}`} />
            <Fact label="MBL/HBL" value={`${shipment.mblNo ?? '—'} / ${shipment.hblNo ?? '—'}`} />
          </div>
        )}
      </section>
      {mode === 'admin' ? (
        <section className="rounded border border-border bg-surface p-5">
          <h2 className="font-semibold">Containers</h2>
          <div className="mt-4 grid gap-3 sm:grid-cols-5">
            <Input
              label="柜号（4字母+7数字）"
              value={container.containerNo}
              onChange={(value) => setContainer({ ...container, containerNo: value.toUpperCase() })}
            />
            <Input
              label="箱型"
              value={container.containerType}
              onChange={(value) =>
                setContainer({ ...container, containerType: value.toUpperCase() })
              }
            />
            <Input
              label="封条号"
              value={container.sealNo}
              onChange={(value) => setContainer({ ...container, sealNo: value })}
            />
            <Input
              label="VGM (KG)"
              value={container.vgmWeight}
              onChange={(value) => setContainer({ ...container, vgmWeight: value })}
            />
            <button
              className={`${primary} self-end`}
              disabled={busy || !/^[A-Z]{4}\d{7}$/.test(container.containerNo)}
              onClick={() => void jsonAction('/containers', optional(container))}
            >
              新增 Container
            </button>
          </div>
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[760px] text-left text-sm">
              <thead>
                <tr className="border-b border-border bg-sidebar text-xs text-muted">
                  <th className={head}>柜号</th>
                  <th className={head}>箱型</th>
                  <th className={head}>封条</th>
                  <th className={head}>VGM</th>
                  <th className={head}>提柜</th>
                  <th className={head}>进港</th>
                  <th className={head}>装船/卸船</th>
                </tr>
              </thead>
              <tbody>
                {shipment.containers.map((item) => (
                  <tr className="border-b border-border" key={item.id}>
                    <td className={cell}>{item.containerNo}</td>
                    <td className={cell}>{item.containerType}</td>
                    <td className={cell}>{item.sealNo ?? '—'}</td>
                    <td className={cell}>{item.vgmWeight ? `${item.vgmWeight} KG` : '—'}</td>
                    <td className={cell}>{dateTime(item.pickupAt)}</td>
                    <td className={cell}>{dateTime(item.gateInAt)}</td>
                    <td className={cell}>
                      {dateTime(item.loadedAt)} / {dateTime(item.dischargedAt)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {shipment.containers.length === 0 ? (
              <div className="py-6 text-center text-sm text-muted">暂无 Container</div>
            ) : null}
          </div>
        </section>
      ) : null}
      <section className="rounded border border-border bg-surface p-5">
        <h2 className="font-semibold">
          {mode === 'admin' ? '基础进度 Timeline' : 'Shipment 进度'}
        </h2>
        {mode === 'admin' ? (
          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            <Input
              label="节点类型"
              value={event.eventType}
              onChange={(value) => setEvent({ ...event, eventType: value.toUpperCase() })}
            />
            <Input
              label="事件时间"
              type="datetime-local"
              value={event.eventTime}
              onChange={(value) => setEvent({ ...event, eventTime: value })}
            />
            <Input
              label="地点代码"
              value={event.locationCode}
              onChange={(value) => setEvent({ ...event, locationCode: value.toUpperCase() })}
            />
            <Input
              label="地点名称"
              value={event.locationName}
              onChange={(value) => setEvent({ ...event, locationName: value })}
            />
            <Input
              label="备注"
              value={event.remark}
              onChange={(value) => setEvent({ ...event, remark: value })}
            />
            <label className="flex items-end gap-2 pb-2 text-sm">
              <input
                checked={event.customerVisible}
                onChange={(e) => setEvent({ ...event, customerVisible: e.target.checked })}
                type="checkbox"
              />
              客户可见
            </label>
            <button
              className={primary}
              disabled={busy || !event.eventTime || !event.eventType}
              onClick={() =>
                void jsonAction('/events', {
                  ...optional(event),
                  eventTime: toIso(event.eventTime),
                })
              }
            >
              新增节点
            </button>
          </div>
        ) : null}
        <ol className="mt-5 space-y-4 border-l-2 border-border pl-5">
          {basicTimeline(shipment).map((item) => (
            <li className="relative" key={item.key}>
              <span
                className={`absolute -left-[27px] top-1 size-3 rounded-full ${item.done ? 'bg-primary' : 'bg-border'}`}
              />
              <div className="font-semibold">{item.label}</div>
              <div className="text-sm text-muted">{item.time}</div>
            </li>
          ))}
          {mode === 'admin'
            ? shipment.trackingEvents.map((item) => (
                <li className="relative" key={item.id}>
                  <span className="absolute -left-[27px] top-1 size-3 rounded-full bg-primary" />
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold">{item.eventType}</span>
                    {!item.customerVisible ? (
                      <span className="rounded bg-sidebar px-2 py-0.5 text-xs text-muted">
                        内部节点
                      </span>
                    ) : null}
                  </div>
                  <div className="text-sm text-muted">
                    {dateTime(item.eventTime)} ·{' '}
                    {item.locationName ?? item.locationCode ?? '地点待确认'}
                  </div>
                  {item.remark ? <div className="mt-1 text-sm">{item.remark}</div> : null}
                </li>
              ))
            : null}
        </ol>
      </section>
      {mode === 'admin' ? (
        <section className="rounded border border-border bg-surface p-5">
          <h2 className="font-semibold">参考附件</h2>
          <div className="mt-4 flex flex-wrap items-end gap-3">
            <label className="text-sm">
              类型
              <select
                className={`${inputClass} mt-1 block`}
                value={documentType}
                onChange={(e) => setDocumentType(e.target.value)}
              >
                <option>DRAFT_BL</option>
                <option>FINAL_BL</option>
                <option>OTHER</option>
              </select>
            </label>
            <input
              accept="application/pdf,image/png,image/jpeg"
              className="text-sm"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              type="file"
            />
            <label className="flex gap-2 pb-2 text-sm">
              <input
                checked={customerVisible}
                onChange={(e) => setCustomerVisible(e.target.checked)}
                type="checkbox"
              />
              客户可见
            </label>
            <button className={primary} disabled={busy || !file} onClick={() => void upload()}>
              上传新版本
            </button>
          </div>
          <div className="mt-4 space-y-2">
            {shipment.documents.map((item) => (
              <button
                className="block text-sm text-primary hover:underline"
                key={item.id}
                onClick={() => void download(item)}
              >
                {item.documentType} · {item.originalFilename} · V{item.version}
                {mode === 'admin' ? ` · ${item.customerVisible ? '客户可见' : '内部'}` : ''}
              </button>
            ))}
            {shipment.documents.length === 0 ? (
              <div className="text-sm text-muted">暂无可用单证</div>
            ) : null}
          </div>
        </section>
      ) : null}
    </div>
  );
}

function Input({
  label,
  value,
  onChange,
  type = 'text',
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
}) {
  return (
    <label className="text-sm">
      <span className="mb-1 block font-medium">{label}</span>
      <input
        className={inputClass}
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  );
}
function Fact({
  label,
  value,
  children,
}: {
  label: string;
  value?: string;
  children?: React.ReactNode;
}) {
  return (
    <div>
      <div className="text-xs text-muted">{label}</div>
      <div className="mt-1 font-semibold">{children ?? value}</div>
    </div>
  );
}
function optional<T extends Record<string, unknown>>(value: T) {
  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => [key, item === '' ? undefined : item]),
  );
}
const toIso = (value: string) => (value ? new Date(value).toISOString() : undefined);
const localDateTime = (value: string | null) =>
  value ? new Date(value).toISOString().slice(0, 16) : '';
const dateTime = (value: string | null) =>
  value ? new Date(value).toLocaleString('zh-CN', { hour12: false }) : '—';
const primary =
  'h-9 rounded bg-primary px-4 text-sm font-semibold text-surface disabled:opacity-40';
const inputClass = 'h-9 w-full rounded border border-border bg-surface px-3 text-sm';
const head = 'px-4 py-3 font-semibold';
const cell = 'px-4 py-3 align-middle';

function shipmentStatusLabel(status: string) {
  return (
    {
      CREATED: '已创建',
      BOOKED: '已订舱',
      DEPARTED: '已开船',
      IN_TRANSIT: '运输中',
      ARRIVED: '已到港',
      COMPLETED: '已完成',
      CANCELLED: '已取消',
    }[status] ?? status
  );
}

function shipmentStatusTone(status: string): StatusTone {
  if (status === 'COMPLETED') return 'success';
  if (status === 'CANCELLED') return 'danger';
  if (status === 'ARRIVED') return 'warning';
  if (status === 'DEPARTED' || status === 'IN_TRANSIT') return 'info';
  return 'neutral';
}

function customerProgressLabel(status: string) {
  return (
    {
      CREATED: '等待订舱确认',
      BOOKED: '等待开船',
      DEPARTED: '已开船',
      IN_TRANSIT: '运输中',
      ARRIVED: '已到港',
      COMPLETED: '已完成',
      CANCELLED: '已取消',
    }[status] ?? status
  );
}

function basicTimeline(shipment: Shipment) {
  const order = ['BOOKED', 'DEPARTED', 'IN_TRANSIT', 'ARRIVED', 'COMPLETED'];
  const rank = order.indexOf(shipment.status);
  return [
    { key: 'booked', status: 'BOOKED', label: '已订舱', time: dateTime(shipment.createdAt) },
    { key: 'departed', status: 'DEPARTED', label: '已开船', time: dateTime(shipment.atd) },
    {
      key: 'transit',
      status: 'IN_TRANSIT',
      label: '运输中',
      time: shipment.status === 'IN_TRANSIT' ? '进行中' : '—',
    },
    { key: 'arrived', status: 'ARRIVED', label: '已到港', time: dateTime(shipment.ata) },
    {
      key: 'completed',
      status: 'COMPLETED',
      label: '已完成',
      time: dateTime(shipment.completedAt),
    },
  ].map((item) => ({ ...item, done: rank >= order.indexOf(item.status) }));
}
