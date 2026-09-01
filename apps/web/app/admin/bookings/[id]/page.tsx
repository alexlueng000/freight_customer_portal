'use client';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '@/components/auth-provider';
import { ErrorState } from '@/components/error-state';
import { LoadingState } from '@/components/loading-state';
import { PageHeader } from '@/components/page-header';
import { StatusBadge } from '@/components/status-badge';
interface Booking {
  bookingNo: string;
  status: string;
  polCode: string;
  podCode: string;
  carrierCode: string | null;
  etd: string | null;
  commodity: string | null;
  packageType: string | null;
  packages: number | null;
  grossWeight: string | null;
  volumeCbm: string | null;
  cargoReadyDate: string | null;
  specialInstructions: string | null;
  isDangerousGoods: boolean;
  shipperName: string | null;
  shipperAddress: string | null;
  bookingContactName: string | null;
  bookingContactEmail: string | null;
  bookingContactPhone: string | null;
  lastStatusRemark: string | null;
  customer: { name: string };
  quote: { quoteNo: string };
  containerRequests: Array<{
    id: string;
    containerType: string;
    quantity: number;
    weightPerContainer: string | null;
    remark: string | null;
  }>;
  shipments: Array<{ id: string; shipmentNo: string; status: string }>;
  reviewActions: Array<{
    id: string;
    action: string;
    reasonCode: string | null;
    customerVisibleRemark: string | null;
    internalRemark: string | null;
    carrierSourceName: string | null;
    carrierReference: string | null;
    createdAt: string;
    actor: { displayName: string } | null;
  }>;
}
interface DocumentRecord {
  id: string;
  documentType: string;
  originalFilename: string;
  version: number;
  createdAt: string;
}
interface SoRecord {
  id: string;
  soNumber: string;
  sourceType: string;
  sourceName: string | null;
  vessel: string | null;
  voyage: string | null;
  cyCutoffAt: string | null;
  siCutoffAt: string | null;
  vgmCutoffAt: string | null;
  terminal: string | null;
  version: number;
  status: 'INTERNAL_DRAFT' | 'PUBLISHED' | 'SUPERSEDED';
  document: { id: string; originalFilename: string; customerVisible: boolean };
}
export default function AdminBookingDetail() {
  const { id } = useParams<{ id: string }>();
  const { apiFetch, user } = useAuth();
  const [b, setB] = useState<Booking | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [dialog, setDialog] = useState<'revision' | 'reject' | 'carrier' | null>(null);
  const [remark, setRemark] = useState('');
  const [reasonCode, setReasonCode] = useState('CARGO_INCOMPLETE');
  const [sourceName, setSourceName] = useState('');
  const [reference, setReference] = useState('');
  const [documents, setDocuments] = useState<DocumentRecord[]>([]);
  const [soRecords, setSoRecords] = useState<SoRecord[]>([]);
  const [soFile, setSoFile] = useState<File | null>(null);
  const [soNumber, setSoNumber] = useState('');
  const [soSourceType, setSoSourceType] = useState('CARRIER');
  const [soSourceName, setSoSourceName] = useState('');
  const [soVessel, setSoVessel] = useState('');
  const [soVoyage, setSoVoyage] = useState('');
  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [bookingResponse, documentsResponse, soResponse] = await Promise.all([
        apiFetch(`/api/v1/admin/bookings/${id}`),
        apiFetch(`/api/v1/bookings/${id}/documents`),
        apiFetch(`/api/v1/admin/bookings/${id}/so-records`),
      ]);
      const p = (await bookingResponse.json()) as Booking & { message?: string };
      if (!bookingResponse.ok) throw new Error(p.message ?? '订舱详情加载失败。');
      const documentPayload = (await documentsResponse.json()) as DocumentRecord[] & {
        message?: string;
      };
      if (!documentsResponse.ok) throw new Error(documentPayload.message ?? '订舱文件加载失败。');
      const soPayload = (await soResponse.json()) as SoRecord[] & { message?: string };
      if (!soResponse.ok) throw new Error(soPayload.message ?? 'SO 记录加载失败。');
      setB(p);
      setDocuments(documentPayload);
      setSoRecords(soPayload);
    } catch (e) {
      setError((e as { message?: string }).message ?? '订舱详情加载失败。');
    } finally {
      setLoading(false);
    }
  }, [apiFetch, id]);
  useEffect(() => {
    void load();
  }, [load]);
  const act = async (
    action: 'approve' | 'request-revision' | 'submit-to-carrier' | 'reject' | 'cancel',
    body: Record<string, unknown> = {},
  ) => {
    setBusy(true);
    setError('');
    try {
      const r = await apiFetch(`/api/v1/admin/bookings/${id}/${action}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
      const p = (await r.json()) as { message?: string };
      if (!r.ok) throw new Error(p.message ?? '操作失败。');
      setRemark('');
      setSourceName('');
      setReference('');
      setDialog(null);
      await load();
    } catch (e) {
      setError((e as { message?: string }).message ?? '操作失败。');
    } finally {
      setBusy(false);
    }
  };
  const createShipment = async () => {
    setBusy(true);
    setError('');
    try {
      const r = await apiFetch(`/api/v1/admin/bookings/${id}/shipments`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: '{}',
      });
      const p = (await r.json()) as { message?: string };
      if (!r.ok) throw new Error(p.message ?? 'Shipment 创建失败。');
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const uploadSo = async () => {
    if (!soFile || !soNumber.trim()) return;
    setBusy(true);
    setError('');
    try {
      const form = new FormData();
      form.append('file', soFile);
      form.append('soNumber', soNumber.trim());
      form.append('sourceType', soSourceType);
      form.append('receivedAt', new Date().toISOString());
      if (soSourceName.trim()) form.append('sourceName', soSourceName.trim());
      if (soVessel.trim()) form.append('vessel', soVessel.trim());
      if (soVoyage.trim()) form.append('voyage', soVoyage.trim());
      const response = await apiFetch(`/api/v1/admin/bookings/${id}/so-records`, {
        method: 'POST',
        body: form,
      });
      const payload = (await response.json()) as { message?: string };
      if (!response.ok) throw new Error(payload.message ?? 'SO 内部保存失败。');
      setSoFile(null);
      setSoNumber('');
      await load();
    } catch (caught) {
      setError((caught as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const publishSo = async (soId: string) => {
    if (!window.confirm('发布后客户将立即可以查看并下载此 SO，确认继续？')) return;
    setBusy(true);
    setError('');
    try {
      const response = await apiFetch(`/api/v1/admin/bookings/${id}/so-records/${soId}/publish`, {
        method: 'POST',
      });
      const payload = (await response.json()) as { message?: string };
      if (!response.ok) throw new Error(payload.message ?? 'SO 发布失败。');
      await load();
    } catch (caught) {
      setError((caught as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const downloadDocument = async (document: DocumentRecord) => {
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
  if (!b) return <ErrorState description={error || '订舱不存在'} onRetry={() => void load()} />;
  const canManage = Boolean(
    user?.roles.some((role) => ['SUPER_ADMIN', 'TENANT_ADMIN', 'OPERATION'].includes(role)),
  );
  return (
    <div className="space-y-5">
      <Link className="text-sm text-primary hover:underline" href="/admin/bookings">
        ← 返回订舱列表
      </Link>
      <PageHeader
        eyebrow={b.customer.name}
        title={b.bookingNo}
        description={`${b.polCode} → ${b.podCode}`}
        actions={
          <div className="flex gap-2">
            {canManage && b.status === 'SUBMITTED' ? (
              <>
                <button className={secondary} disabled={busy} onClick={() => setDialog('revision')}>
                  退回补充
                </button>
                <button
                  className={primary}
                  disabled={busy}
                  onClick={() => {
                    if (window.confirm('确认客户资料完整并审核通过？')) void act('approve');
                  }}
                >
                  审核通过
                </button>
              </>
            ) : null}
            {canManage && b.status === 'APPROVED' ? (
              <button className={primary} disabled={busy} onClick={() => setDialog('carrier')}>
                提交船司/代理
              </button>
            ) : null}
            {canManage && ['SUBMITTED', 'APPROVED', 'BOOKING_SUBMITTED'].includes(b.status) ? (
              <button className={danger} disabled={busy} onClick={() => setDialog('reject')}>
                业务拒绝
              </button>
            ) : null}
            {canManage && ['SUBMITTED', 'APPROVED', 'BOOKING_SUBMITTED'].includes(b.status) ? (
              <button
                className={secondary}
                disabled={busy}
                onClick={() => void act('cancel', { remark: 'Cancelled by operation' })}
              >
                取消
              </button>
            ) : null}
          </div>
        }
      />
      {error ? (
        <div className="rounded border border-danger/20 bg-danger/10 px-4 py-3 text-sm text-danger">
          {error}
        </div>
      ) : null}
      <section className="grid gap-4 rounded border border-border bg-surface p-4 sm:grid-cols-4">
        <Fact label="状态">
          <StatusBadge>{b.status}</StatusBadge>
        </Fact>
        <Fact label="来源报价" value={b.quote.quoteNo} />
        <Fact label="船司" value={b.carrierCode ?? '—'} />
        <Fact label="ETD" value={b.etd?.slice(0, 10) ?? '待确认'} />
      </section>
      <section className="grid gap-4 rounded border border-border bg-surface p-5 sm:grid-cols-3">
        <Fact label="品名" value={b.commodity ?? '—'} />
        <Fact label="包装" value={`${b.packageType ?? '—'} / ${b.packages ?? '—'} 件`} />
        <Fact label="毛重/体积" value={`${b.grossWeight ?? '—'} KG / ${b.volumeCbm ?? '—'} CBM`} />
        <Fact label="备货日期" value={b.cargoReadyDate?.slice(0, 10) ?? '—'} />
        <Fact label="危险品" value={b.isDangerousGoods ? '是' : '否'} />
        <Fact label="发货人" value={b.shipperName ?? '—'} />
        <Fact label="订舱联系人" value={b.bookingContactName ?? '—'} />
        <div className="sm:col-span-3">
          <div className="text-xs text-muted">发货人地址</div>
          <div className="mt-1 text-sm">{b.shipperAddress ?? '—'}</div>
        </div>
      </section>
      <section className="rounded border border-border bg-surface p-5">
        <h2 className="font-semibold">箱量需求</h2>
        <div className="mt-3 space-y-2">
          {b.containerRequests.map((c) => (
            <div className="grid grid-cols-4 rounded bg-sidebar px-4 py-3 text-sm" key={c.id}>
              <span className="font-semibold">{c.containerType}</span>
              <span>{c.quantity} 柜</span>
              <span>{c.weightPerContainer ? `${c.weightPerContainer} KG/柜` : '重量待确认'}</span>
              <span>{c.remark ?? '—'}</span>
            </div>
          ))}
        </div>
      </section>
      <section className="rounded border border-border bg-surface p-5">
        <h2 className="font-semibold">审核与执行记录</h2>
        <div className="mt-3 space-y-2 text-sm">
          {b.reviewActions.map((action) => (
            <div className="rounded bg-sidebar px-3 py-2" key={action.id}>
              <div className="font-semibold">
                {action.action} · {action.actor?.displayName ?? '系统'}
              </div>
              <div className="text-muted">{new Date(action.createdAt).toLocaleString('zh-CN')}</div>
              {action.reasonCode ? <div>原因：{action.reasonCode}</div> : null}
              {action.customerVisibleRemark ? (
                <div>客户说明：{action.customerVisibleRemark}</div>
              ) : null}
              {action.internalRemark ? <div>内部备注：{action.internalRemark}</div> : null}
              {action.carrierSourceName || action.carrierReference ? (
                <div>
                  船司/代理：{action.carrierSourceName ?? '—'} · {action.carrierReference ?? '—'}
                </div>
              ) : null}
            </div>
          ))}
          {!b.reviewActions.length ? <div className="text-muted">暂无审核记录</div> : null}
        </div>
      </section>
      <section className="rounded border border-border bg-surface p-5">
        <h2 className="font-semibold">SO 与 Shipment</h2>
        {b.status === 'BOOKING_SUBMITTED' ? (
          <p className="mt-3 text-sm text-muted">已提交船司/代理，等待登记并发布 SO。</p>
        ) : null}
        {canManage && ['BOOKING_SUBMITTED', 'BOOKED'].includes(b.status) ? (
          <div className="mt-4 grid gap-3 rounded border border-border p-4 sm:grid-cols-2">
            <label className="text-sm">
              <span className="mb-1 block font-medium">SO 文件</span>
              <input
                accept="application/pdf,image/png,image/jpeg"
                onChange={(event) => setSoFile(event.target.files?.[0] ?? null)}
                type="file"
              />
            </label>
            <label className="text-sm">
              <span className="mb-1 block font-medium">SO 号</span>
              <input
                className={input}
                value={soNumber}
                onChange={(event) => setSoNumber(event.target.value)}
              />
            </label>
            <label className="text-sm">
              <span className="mb-1 block font-medium">来源类型</span>
              <select
                className={input}
                value={soSourceType}
                onChange={(event) => setSoSourceType(event.target.value)}
              >
                <option>CARRIER</option>
                <option>AGENT</option>
                <option>OTHER</option>
              </select>
            </label>
            <label className="text-sm">
              <span className="mb-1 block font-medium">来源名称</span>
              <input
                className={input}
                value={soSourceName}
                onChange={(event) => setSoSourceName(event.target.value)}
              />
            </label>
            <label className="text-sm">
              <span className="mb-1 block font-medium">船名</span>
              <input
                className={input}
                value={soVessel}
                onChange={(event) => setSoVessel(event.target.value)}
              />
            </label>
            <label className="text-sm">
              <span className="mb-1 block font-medium">航次</span>
              <input
                className={input}
                value={soVoyage}
                onChange={(event) => setSoVoyage(event.target.value)}
              />
            </label>
            <button
              className={`${primary} sm:col-span-2`}
              disabled={busy || !soFile || !soNumber.trim()}
              onClick={() => void uploadSo()}
              type="button"
            >
              内部保存 SO（客户不可见）
            </button>
          </div>
        ) : null}
        <div className="mt-4 space-y-2 text-sm">
          {soRecords.map((record) => (
            <div className="rounded border border-border p-3" key={record.id}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="font-semibold">
                  V{record.version} · {record.soNumber} · {record.status}
                </div>
                {canManage && record.status === 'INTERNAL_DRAFT' ? (
                  <button
                    className={primary}
                    disabled={busy}
                    onClick={() => void publishSo(record.id)}
                    type="button"
                  >
                    发布给客户
                  </button>
                ) : null}
              </div>
              <div className="mt-1 text-muted">
                {record.sourceType} / {record.sourceName ?? '—'} · {record.vessel ?? '—'} /{' '}
                {record.voyage ?? '—'}
              </div>
              <div className="text-muted">
                文件：{record.document.originalFilename} · 客户可见：
                {record.document.customerVisible ? '是' : '否'}
              </div>
            </div>
          ))}
        </div>
        {b.status === 'BOOKED' && b.shipments.length === 0 ? (
          <button
            className={`${primary} mt-3`}
            disabled={busy}
            onClick={() => void createShipment()}
            type="button"
          >
            创建 Shipment
          </button>
        ) : null}
        <div className="mt-4 space-y-2 text-sm">
          {documents.map((document) => (
            <button
              className="block text-primary hover:underline"
              onClick={() => void downloadDocument(document)}
              key={document.id}
              type="button"
            >
              {document.documentType} · {document.originalFilename} · V{document.version}
            </button>
          ))}
          {b.shipments.map((shipment) => (
            <Link
              className="block rounded bg-sidebar px-3 py-2 text-primary hover:underline"
              href={`/admin/shipments/${shipment.id}`}
              key={shipment.id}
            >
              Shipment：{shipment.shipmentNo} · {shipment.status}
            </Link>
          ))}
          {!documents.length && !b.shipments.length ? (
            <div className="text-muted">暂无 SO 或 Shipment</div>
          ) : null}
        </div>
      </section>
      {dialog ? (
        <ActionDialog
          busy={busy}
          mode={dialog}
          reasonCode={reasonCode}
          reference={reference}
          remark={remark}
          sourceName={sourceName}
          onClose={() => setDialog(null)}
          onReasonCode={setReasonCode}
          onReference={setReference}
          onRemark={setRemark}
          onSourceName={setSourceName}
          onSubmit={() => {
            if (dialog === 'revision')
              void act('request-revision', { reasonCode, customerVisibleRemark: remark });
            if (dialog === 'reject') void act('reject', { remark });
            if (dialog === 'carrier')
              void act('submit-to-carrier', {
                sourceName: sourceName || undefined,
                reference: reference || undefined,
                internalRemark: remark || undefined,
              });
          }}
        />
      ) : null}
    </div>
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
function ActionDialog(props: {
  busy: boolean;
  mode: 'revision' | 'reject' | 'carrier';
  reasonCode: string;
  reference: string;
  remark: string;
  sourceName: string;
  onClose(): void;
  onReasonCode(value: string): void;
  onReference(value: string): void;
  onRemark(value: string): void;
  onSourceName(value: string): void;
  onSubmit(): void;
}) {
  const needsRemark = props.mode !== 'carrier';
  const title =
    props.mode === 'revision'
      ? '退回客户补充资料'
      : props.mode === 'reject'
        ? '确认业务拒绝'
        : '提交船司/代理';
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/35 p-4"
      role="dialog"
      aria-modal="true"
    >
      <div className="w-full max-w-lg space-y-4 rounded border border-border bg-surface p-5 shadow-xl">
        <h2 className="font-semibold">{title}</h2>
        {props.mode === 'revision' ? (
          <label className="block text-sm">
            <span className="mb-1 block font-medium">退回原因</span>
            <select
              className={input}
              value={props.reasonCode}
              onChange={(event) => props.onReasonCode(event.target.value)}
            >
              {[
                'CARGO_INCOMPLETE',
                'SHIPPER_INCOMPLETE',
                'CONTACT_INCOMPLETE',
                'CARGO_READY_DATE_INVALID',
                'CARGO_CONTAINER_CONFLICT',
                'DANGEROUS_GOODS_INFO_REQUIRED',
                'OTHER',
              ].map((value) => (
                <option key={value}>{value}</option>
              ))}
            </select>
          </label>
        ) : null}
        {props.mode === 'carrier' ? (
          <div className="grid gap-3 sm:grid-cols-2">
            <input
              className={input}
              maxLength={200}
              placeholder="船司/代理名称（选填）"
              value={props.sourceName}
              onChange={(event) => props.onSourceName(event.target.value)}
            />
            <input
              className={input}
              maxLength={200}
              placeholder="提交参考号（选填）"
              value={props.reference}
              onChange={(event) => props.onReference(event.target.value)}
            />
          </div>
        ) : null}
        <label className="block text-sm">
          <span className="mb-1 block font-medium">
            {props.mode === 'carrier' ? '内部备注（选填）' : '客户可见说明'}
          </span>
          <textarea
            className={`${input} min-h-24 py-2`}
            maxLength={1000}
            value={props.remark}
            onChange={(event) => props.onRemark(event.target.value)}
          />
        </label>
        <div className="flex justify-end gap-2">
          <button className={secondary} disabled={props.busy} onClick={() => props.onClose()}>
            取消
          </button>
          <button
            className={props.mode === 'reject' ? danger : primary}
            disabled={props.busy || (needsRemark && props.remark.trim().length < 3)}
            onClick={() => props.onSubmit()}
          >
            确认
          </button>
        </div>
      </div>
    </div>
  );
}
const input = 'h-10 w-full rounded border border-border bg-surface px-3 text-sm';
const primary =
  'h-9 rounded bg-primary px-4 text-sm font-semibold text-surface disabled:opacity-40';
const secondary = 'h-9 rounded border border-border px-4 text-sm font-semibold disabled:opacity-40';
const danger =
  'h-9 rounded border border-danger/30 px-4 text-sm font-semibold text-danger disabled:opacity-40';
