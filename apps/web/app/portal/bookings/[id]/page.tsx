'use client';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '@/components/auth-provider';
import { ErrorState } from '@/components/error-state';
import { LoadingState } from '@/components/loading-state';
import { PageHeader } from '@/components/page-header';
import { StatusBadge } from '@/components/status-badge';

interface Container {
  id?: string;
  containerType: string;
  quantity: number;
  weightPerContainer: string | null;
  remark: string | null;
}
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
  containerRequests: Container[];
  shipments: Array<{ id: string; shipmentNo: string; status: string }>;
}
interface DocumentRecord {
  id: string;
  documentType: string;
  originalFilename: string;
  version: number;
}
export default function BookingDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { apiFetch } = useAuth();
  const [booking, setBooking] = useState<Booking | null>(null);
  const [form, setForm] = useState<Booking | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [documents, setDocuments] = useState<DocumentRecord[]>([]);
  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [r, documentResponse] = await Promise.all([
        apiFetch(`/api/v1/bookings/${encodeURIComponent(id)}`),
        apiFetch(`/api/v1/bookings/${encodeURIComponent(id)}/documents`),
      ]);
      const p = (await r.json()) as Booking & { message?: string };
      if (!r.ok) throw new Error(p.message ?? '订舱详情加载失败。');
      const documentPayload = (await documentResponse.json()) as DocumentRecord[] & {
        message?: string;
      };
      if (!documentResponse.ok) throw new Error(documentPayload.message ?? '订舱文件加载失败。');
      setBooking(p);
      setForm(p);
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
  const change = (key: keyof Booking, value: unknown) =>
    setForm((v) => (v ? { ...v, [key]: value } : v));
  const save = async () => {
    if (!form) return;
    setBusy(true);
    setError('');
    try {
      const r = await apiFetch(`/api/v1/bookings/${id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          commodity: form.commodity,
          packages: Number(form.packages),
          grossWeight: form.grossWeight,
          volumeCbm: form.volumeCbm,
          isDangerousGoods: form.isDangerousGoods,
          shipperName: form.shipperName,
          shipperAddress: form.shipperAddress,
          bookingContactName: form.bookingContactName,
          bookingContactEmail: form.bookingContactEmail || undefined,
          bookingContactPhone: form.bookingContactPhone || undefined,
          containerRequests: form.containerRequests.map((c) => ({
            containerType: c.containerType,
            quantity: Number(c.quantity),
            weightPerContainer: c.weightPerContainer || undefined,
            remark: c.remark || undefined,
          })),
        }),
      });
      const p = (await r.json()) as { message?: string };
      if (!r.ok) throw new Error(p.message ?? '保存失败。');
      await load();
    } catch (e) {
      setError((e as { message?: string }).message ?? '保存失败。');
    } finally {
      setBusy(false);
    }
  };
  const action = async (name: 'submit' | 'cancel') => {
    setBusy(true);
    setError('');
    try {
      const r = await apiFetch(`/api/v1/bookings/${id}/${name}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ remark: name === 'cancel' ? '客户取消订舱' : undefined }),
      });
      const p = (await r.json()) as { message?: string };
      if (!r.ok) throw new Error(p.message ?? '操作失败。');
      await load();
    } catch (e) {
      setError((e as { message?: string }).message ?? '操作失败。');
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
  if (!booking || !form)
    return <ErrorState description={error || '订舱不存在'} onRetry={() => void load()} />;
  const editable = booking.status === 'DRAFT';
  return (
    <div className="space-y-5">
      <Link className="text-sm text-primary hover:underline" href="/portal/bookings">
        ← 返回订舱列表
      </Link>
      <PageHeader
        eyebrow="客户订舱"
        title={booking.bookingNo}
        description={`${booking.polCode} → ${booking.podCode}`}
        actions={
          <div className="flex gap-2">
            {editable ? (
              <>
                <button className={secondary} disabled={busy} onClick={() => void action('cancel')}>
                  取消订舱
                </button>
                <button className={secondary} disabled={busy} onClick={() => void save()}>
                  保存草稿
                </button>
                <button className={primary} disabled={busy} onClick={() => void action('submit')}>
                  提交审核
                </button>
              </>
            ) : ['SUBMITTED', 'UNDER_REVIEW', 'CONFIRMED'].includes(booking.status) ? (
              <button className={secondary} disabled={busy} onClick={() => void action('cancel')}>
                取消订舱
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
          <StatusBadge>{booking.status}</StatusBadge>
        </Fact>
        <Fact label="船司" value={booking.carrierCode ?? '—'} />
        <Fact label="ETD" value={booking.etd?.slice(0, 10) ?? '待确认'} />
        <Fact label="状态备注" value={booking.lastStatusRemark ?? '—'} />
      </section>
      <section className="grid gap-4 rounded border border-border bg-surface p-5 sm:grid-cols-2">
        <Field label="品名 *">
          <input
            className={input}
            disabled={!editable}
            value={form.commodity ?? ''}
            onChange={(e) => change('commodity', e.target.value)}
          />
        </Field>
        <Field label="件数 *">
          <input
            className={input}
            disabled={!editable}
            type="number"
            min="1"
            value={form.packages ?? ''}
            onChange={(e) => change('packages', e.target.value)}
          />
        </Field>
        <Field label="毛重 KG *">
          <input
            className={input}
            disabled={!editable}
            inputMode="decimal"
            value={form.grossWeight ?? ''}
            onChange={(e) => change('grossWeight', e.target.value)}
          />
        </Field>
        <Field label="体积 CBM *">
          <input
            className={input}
            disabled={!editable}
            inputMode="decimal"
            value={form.volumeCbm ?? ''}
            onChange={(e) => change('volumeCbm', e.target.value)}
          />
        </Field>
        <Field label="发货人名称 *">
          <input
            className={input}
            disabled={!editable}
            value={form.shipperName ?? ''}
            onChange={(e) => change('shipperName', e.target.value)}
          />
        </Field>
        <Field label="订舱联系人 *">
          <input
            className={input}
            disabled={!editable}
            value={form.bookingContactName ?? ''}
            onChange={(e) => change('bookingContactName', e.target.value)}
          />
        </Field>
        <Field label="联系人邮箱">
          <input
            className={input}
            disabled={!editable}
            type="email"
            value={form.bookingContactEmail ?? ''}
            onChange={(e) => change('bookingContactEmail', e.target.value)}
          />
        </Field>
        <Field label="联系人电话">
          <input
            className={input}
            disabled={!editable}
            value={form.bookingContactPhone ?? ''}
            onChange={(e) => change('bookingContactPhone', e.target.value)}
          />
        </Field>
        <Field label="发货人地址 *" wide>
          <textarea
            className={`${input} min-h-24 py-2`}
            disabled={!editable}
            value={form.shipperAddress ?? ''}
            onChange={(e) => change('shipperAddress', e.target.value)}
          />
        </Field>
        <label className="flex items-center gap-2 text-sm">
          <input
            checked={form.isDangerousGoods}
            disabled={!editable}
            type="checkbox"
            onChange={(e) => change('isDangerousGoods', e.target.checked)}
          />
          危险品
        </label>
      </section>
      <section className="rounded border border-border bg-surface p-5">
        <h2 className="font-semibold">SO 与 Shipment</h2>
        <div className="mt-3 space-y-2 text-sm">
          {documents.map((document) => (
            <button
              className="block text-primary hover:underline"
              key={document.id}
              onClick={() => void downloadDocument(document)}
              type="button"
            >
              下载 {document.documentType}：{document.originalFilename}（V{document.version}）
            </button>
          ))}
          {booking.shipments.map((shipment) => (
            <div className="rounded bg-sidebar px-3 py-2" key={shipment.id}>
              Shipment：{shipment.shipmentNo} · {shipment.status}
            </div>
          ))}
          {!documents.length && !booking.shipments.length ? (
            <div className="text-muted">SO 尚未放出，Shipment 尚未创建。</div>
          ) : null}
        </div>
      </section>
      <section className="rounded border border-border bg-surface p-5">
        <h2 className="font-semibold">箱量需求 *</h2>
        <div className="mt-4 space-y-3">
          {form.containerRequests.map((c, i) => (
            <div className="grid gap-3 sm:grid-cols-4" key={`${c.containerType}-${i}`}>
              <input
                className={input}
                disabled={!editable}
                value={c.containerType}
                onChange={(e) =>
                  change(
                    'containerRequests',
                    form.containerRequests.map((x, j) =>
                      j === i ? { ...x, containerType: e.target.value } : x,
                    ),
                  )
                }
              />
              <input
                className={input}
                disabled={!editable}
                min="1"
                type="number"
                value={c.quantity}
                onChange={(e) =>
                  change(
                    'containerRequests',
                    form.containerRequests.map((x, j) =>
                      j === i ? { ...x, quantity: Number(e.target.value) } : x,
                    ),
                  )
                }
              />
              <input
                className={input}
                disabled={!editable}
                inputMode="decimal"
                placeholder="单柜重量 KG"
                value={c.weightPerContainer ?? ''}
                onChange={(e) =>
                  change(
                    'containerRequests',
                    form.containerRequests.map((x, j) =>
                      j === i ? { ...x, weightPerContainer: e.target.value } : x,
                    ),
                  )
                }
              />
              <input
                className={input}
                disabled={!editable}
                placeholder="备注"
                value={c.remark ?? ''}
                onChange={(e) =>
                  change(
                    'containerRequests',
                    form.containerRequests.map((x, j) =>
                      j === i ? { ...x, remark: e.target.value } : x,
                    ),
                  )
                }
              />
            </div>
          ))}
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
function Field({
  label,
  wide,
  children,
}: {
  label: string;
  wide?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className={wide ? 'sm:col-span-2' : ''}>
      <span className="mb-1 block text-sm font-medium">{label}</span>
      {children}
    </label>
  );
}
const input =
  'h-10 w-full rounded border border-border bg-surface px-3 text-sm disabled:bg-sidebar';
const primary =
  'h-9 rounded bg-primary px-4 text-sm font-semibold text-surface disabled:opacity-40';
const secondary = 'h-9 rounded border border-border px-4 text-sm font-semibold disabled:opacity-40';
