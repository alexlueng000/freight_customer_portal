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
  packages: number | null;
  grossWeight: string | null;
  volumeCbm: string | null;
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
}
interface DocumentRecord {
  id: string;
  documentType: string;
  originalFilename: string;
  version: number;
  createdAt: string;
}
export default function AdminBookingDetail() {
  const { id } = useParams<{ id: string }>();
  const { apiFetch } = useAuth();
  const [b, setB] = useState<Booking | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [remark, setRemark] = useState('');
  const [documents, setDocuments] = useState<DocumentRecord[]>([]);
  const [soFile, setSoFile] = useState<File | null>(null);
  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [bookingResponse, documentsResponse] = await Promise.all([
        apiFetch(`/api/v1/admin/bookings/${id}`),
        apiFetch(`/api/v1/bookings/${id}/documents`),
      ]);
      const p = (await bookingResponse.json()) as Booking & { message?: string };
      if (!bookingResponse.ok) throw new Error(p.message ?? '订舱详情加载失败。');
      const documentPayload = (await documentsResponse.json()) as DocumentRecord[] & {
        message?: string;
      };
      if (!documentsResponse.ok) throw new Error(documentPayload.message ?? '订舱文件加载失败。');
      setB(p);
      setDocuments(documentPayload);
    } catch (e) {
      setError((e as { message?: string }).message ?? '订舱详情加载失败。');
    } finally {
      setLoading(false);
    }
  }, [apiFetch, id]);
  useEffect(() => {
    void load();
  }, [load]);
  const act = async (action: 'review' | 'confirm' | 'reject' | 'cancel') => {
    setBusy(true);
    setError('');
    try {
      const r = await apiFetch(`/api/v1/admin/bookings/${id}/${action}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ remark: remark || undefined }),
      });
      const p = (await r.json()) as { message?: string };
      if (!r.ok) throw new Error(p.message ?? '操作失败。');
      setRemark('');
      await load();
    } catch (e) {
      setError((e as { message?: string }).message ?? '操作失败。');
    } finally {
      setBusy(false);
    }
  };
  const releaseSo = async () => {
    if (!soFile) return;
    setBusy(true);
    setError('');
    try {
      const form = new FormData();
      form.append('file', soFile);
      const r = await apiFetch(`/api/v1/admin/bookings/${id}/release-so`, {
        method: 'POST',
        body: form,
      });
      const p = (await r.json()) as { message?: string };
      if (!r.ok) throw new Error(p.message ?? 'SO 上传失败。');
      setSoFile(null);
      await load();
    } catch (e) {
      setError((e as Error).message);
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
            {b.status === 'SUBMITTED' ? (
              <button className={primary} disabled={busy} onClick={() => void act('review')}>
                开始审核
              </button>
            ) : null}
            {b.status === 'UNDER_REVIEW' ? (
              <>
                <button
                  className={danger}
                  disabled={busy || remark.trim().length < 3}
                  onClick={() => void act('reject')}
                >
                  拒绝
                </button>
                <button className={primary} disabled={busy} onClick={() => void act('confirm')}>
                  确认订舱
                </button>
              </>
            ) : null}
            {['SUBMITTED', 'UNDER_REVIEW', 'CONFIRMED'].includes(b.status) ? (
              <button className={secondary} disabled={busy} onClick={() => void act('cancel')}>
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
      {['SUBMITTED', 'UNDER_REVIEW', 'CONFIRMED'].includes(b.status) ? (
        <label className="block rounded border border-border bg-surface p-4">
          <span className="mb-1 block text-sm font-medium">审核备注（拒绝时必填）</span>
          <textarea
            className="min-h-20 w-full rounded border border-border bg-surface p-3 text-sm"
            maxLength={500}
            value={remark}
            onChange={(e) => setRemark(e.target.value)}
          />
        </label>
      ) : null}
      <section className="grid gap-4 rounded border border-border bg-surface p-5 sm:grid-cols-3">
        <Fact label="品名" value={b.commodity ?? '—'} />
        <Fact label="件数" value={b.packages?.toString() ?? '—'} />
        <Fact label="毛重/体积" value={`${b.grossWeight ?? '—'} KG / ${b.volumeCbm ?? '—'} CBM`} />
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
        <h2 className="font-semibold">SO 与 Shipment</h2>
        {b.status === 'CONFIRMED' ? (
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <input
              accept="application/pdf,image/png,image/jpeg"
              className="text-sm"
              onChange={(event) => setSoFile(event.target.files?.[0] ?? null)}
              type="file"
            />
            <button
              className={primary}
              disabled={busy || !soFile}
              onClick={() => void releaseSo()}
              type="button"
            >
              上传并放出 SO
            </button>
          </div>
        ) : null}
        {b.status === 'SO_RELEASED' && b.shipments.length === 0 ? (
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
const primary =
  'h-9 rounded bg-primary px-4 text-sm font-semibold text-surface disabled:opacity-40';
const secondary = 'h-9 rounded border border-border px-4 text-sm font-semibold disabled:opacity-40';
const danger =
  'h-9 rounded border border-danger/30 px-4 text-sm font-semibold text-danger disabled:opacity-40';
