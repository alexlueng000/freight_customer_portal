'use client';
import { AlertTriangle, CheckCircle2, Clock, FileCheck2 } from 'lucide-react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '@/components/auth-provider';
import { ErrorState } from '@/components/error-state';
import { LoadingState } from '@/components/loading-state';
import { PageHeader } from '@/components/page-header';
import { FieldLabel, RequiredLegend } from '@/components/required-mark';
import { StatusBadge } from '@/components/status-badge';
import { hasPermission } from '@/lib/auth';
import { bookingStatusTone, customerBookingStatusLabel } from '@/lib/booking-status';

interface Container {
  id?: string;
  containerType: string;
  quantity: number;
  weightPerContainer: string | null;
  remark: string | null;
}
interface Booking {
  id: string;
  bookingNo: string;
  quoteId: string | null;
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
  isDangerousGoods: boolean;
  specialInstructions: string | null;
  sourceShipperId: string | null;
  shipperName: string | null;
  shipperAddress: string | null;
  bookingContactName: string | null;
  bookingContactEmail: string | null;
  bookingContactPhone: string | null;
  lastStatusRemark: string | null;
  containerRequests: Container[];
  shipments: Array<{ id: string; shipmentNo: string; status: string }>;
  quote: { quoteNo: string; currency: string; totalAmount: string } | null;
}
interface CustomerShipper {
  id: string;
  name: string;
  address: string;
  contactName: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
  isDefault: boolean;
  status: 'ACTIVE' | 'INACTIVE';
}
interface SoRecord {
  id: string;
  soNumber: string;
  vessel: string | null;
  voyage: string | null;
  cyCutoffAt: string | null;
  siCutoffAt: string | null;
  vgmCutoffAt: string | null;
  terminal: string | null;
  version: number;
  document: { id: string; originalFilename: string };
}
interface DocumentRecord {
  id: string;
  documentType: string;
  originalFilename: string;
  version: number;
}
type FieldErrors = Partial<
  Record<keyof Booking | 'bookingContact' | 'containerRequests' | 'dangerousGoodsInfo', string>
>;
interface ApiErrorPayload {
  code?: string;
  message?: string;
  details?: { errors?: string[]; missing?: string[]; fieldErrors?: Record<string, string[]> };
}
class BookingApiError extends Error {
  constructor(
    message: string,
    readonly payload?: ApiErrorPayload,
  ) {
    super(message);
  }
}
export default function BookingDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { apiFetch, user } = useAuth();
  const canEditBooking = hasPermission(user, 'booking.create');
  const canSubmitBooking = hasPermission(user, 'booking.submit');
  const [booking, setBooking] = useState<Booking | null>(null);
  const [form, setForm] = useState<Booking | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [confirmingSubmit, setConfirmingSubmit] = useState(false);
  const [documents, setDocuments] = useState<DocumentRecord[]>([]);
  const [shippers, setShippers] = useState<CustomerShipper[]>([]);
  const [soRecords, setSoRecords] = useState<SoRecord[]>([]);
  const [saveShipperToAddressBook, setSaveShipperToAddressBook] = useState(false);
  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [r, documentResponse, shipperResponse, soResponse] = await Promise.all([
        apiFetch(`/api/v1/bookings/${encodeURIComponent(id)}`),
        apiFetch(`/api/v1/bookings/${encodeURIComponent(id)}/documents`),
        apiFetch('/api/v1/bookings/shippers'),
        apiFetch(`/api/v1/bookings/${encodeURIComponent(id)}/so-records`),
      ]);
      const p = (await r.json()) as Booking & { message?: string };
      if (!r.ok) throw new Error(p.message ?? '订舱详情加载失败。');
      const documentPayload = (await documentResponse.json()) as DocumentRecord[] & {
        message?: string;
      };
      if (!documentResponse.ok) throw new Error(documentPayload.message ?? '订舱文件加载失败。');
      const shipperPayload = (await shipperResponse.json()) as CustomerShipper[] & {
        message?: string;
      };
      if (!shipperResponse.ok) throw new Error(shipperPayload.message ?? '常用发货人加载失败。');
      const soPayload = (await soResponse.json()) as SoRecord[] & { message?: string };
      if (!soResponse.ok) throw new Error(soPayload.message ?? 'SO 记录加载失败。');
      setBooking(p);
      setForm(p);
      setDocuments(documentPayload);
      setShippers(shipperPayload);
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
  const change = (key: keyof Booking, value: unknown) =>
    setForm((v) => (v ? { ...v, [key]: value } : v));
  const saveDraft = async (currentForm: Booking) => {
    let sourceShipperId = currentForm.sourceShipperId || undefined;
    if (saveShipperToAddressBook && !sourceShipperId) {
      if (!currentForm.shipperName?.trim() || !currentForm.shipperAddress?.trim()) {
        throw new Error('请先填写发货人名称和地址。');
      }
      const shipperResponse = await apiFetch('/api/v1/bookings/shippers', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          name: currentForm.shipperName,
          address: currentForm.shipperAddress,
          isDefault: shippers.length === 0,
        }),
      });
      const shipperPayload = (await shipperResponse.json()) as CustomerShipper & ApiErrorPayload;
      if (!shipperResponse.ok)
        throw new BookingApiError(
          formatApiError(shipperPayload, '保存常用发货人失败。'),
          shipperPayload,
        );
      sourceShipperId = shipperPayload.id;
      setShippers((current) => [
        shipperPayload,
        ...current.filter((item) => item.id !== shipperPayload.id),
      ]);
      setForm((current) =>
        current ? { ...current, sourceShipperId: shipperPayload.id } : current,
      );
      setSaveShipperToAddressBook(false);
    }
    const r = await apiFetch(`/api/v1/bookings/${id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        commodity: optionalText(currentForm.commodity),
        packageType: optionalText(currentForm.packageType),
        packages: currentForm.packages ? Number(currentForm.packages) : undefined,
        grossWeight: optionalText(currentForm.grossWeight),
        volumeCbm: optionalText(currentForm.volumeCbm),
        cargoReadyDate: currentForm.cargoReadyDate?.slice(0, 10),
        isDangerousGoods: currentForm.isDangerousGoods,
        specialInstructions: optionalText(currentForm.specialInstructions),
        sourceShipperId,
        shipperName: optionalText(currentForm.shipperName),
        shipperAddress: optionalText(currentForm.shipperAddress),
        bookingContactName: optionalText(currentForm.bookingContactName),
        bookingContactEmail: optionalText(currentForm.bookingContactEmail),
        bookingContactPhone: optionalText(currentForm.bookingContactPhone),
      }),
    });
    const payload = (await r.json()) as ApiErrorPayload;
    if (!r.ok) throw new BookingApiError(formatApiError(payload, '保存失败。'), payload);
  };
  const save = async () => {
    if (!form) return;
    setBusy(true);
    setError('');
    setFieldErrors({});
    try {
      await saveDraft(form);
      await load();
    } catch (e) {
      const bookingError = toBookingApiError(e);
      setFieldErrors(mapServerFieldErrors(bookingError.payload));
      setError(bookingError.message);
    } finally {
      setBusy(false);
    }
  };
  const selectShipper = (shipperId: string) => {
    const shipper = shippers.find((item) => item.id === shipperId);
    setForm((current) =>
      current
        ? {
            ...current,
            sourceShipperId: shipper?.id ?? null,
            shipperName: shipper?.name ?? current.shipperName,
            shipperAddress: shipper?.address ?? current.shipperAddress,
          }
        : current,
    );
    setSaveShipperToAddressBook(false);
  };
  const updateSelectedShipper = async (changes: Record<string, unknown>) => {
    if (!form?.sourceShipperId) return;
    setBusy(true);
    setError('');
    try {
      const response = await apiFetch(`/api/v1/bookings/shippers/${form.sourceShipperId}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(changes),
      });
      const payload = (await response.json()) as CustomerShipper & ApiErrorPayload;
      if (!response.ok)
        throw new BookingApiError(formatApiError(payload, '更新常用发货人失败。'), payload);
      if (payload.status === 'INACTIVE') {
        setShippers((current) => current.filter((item) => item.id !== payload.id));
        change('sourceShipperId', null);
      } else {
        setShippers((current) =>
          current
            .map((item) =>
              item.id === payload.id
                ? payload
                : { ...item, isDefault: payload.isDefault ? false : item.isDefault },
            )
            .sort(
              (a, b) => Number(b.isDefault) - Number(a.isDefault) || a.name.localeCompare(b.name),
            ),
        );
      }
    } catch (caught) {
      const bookingError = toBookingApiError(caught);
      setFieldErrors(mapServerFieldErrors(bookingError.payload));
      setError(bookingError.message);
    } finally {
      setBusy(false);
    }
  };
  const action = async (name: 'submit' | 'cancel') => {
    if (!form) return false;
    setBusy(true);
    setError('');
    setFieldErrors({});
    try {
      if (name === 'submit') {
        const validationErrors = validateForSubmit(form);
        if (Object.keys(validationErrors).length) {
          setFieldErrors(validationErrors);
          setError('请补充或修正下方标红的必填信息后再提交。');
          return false;
        }
        await saveDraft(form);
      }
      const r = await apiFetch(`/api/v1/bookings/${id}/${name}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ remark: name === 'cancel' ? '客户取消订舱' : undefined }),
      });
      const p = (await r.json()) as ApiErrorPayload;
      if (!r.ok) {
        setFieldErrors(mapServerFieldErrors(p));
        throw new BookingApiError(formatApiError(p, '操作失败。'), p);
      }
      await load();
      return true;
    } catch (e) {
      const bookingError = toBookingApiError(e);
      setFieldErrors(mapServerFieldErrors(bookingError.payload));
      setError(bookingError.message);
      return false;
    } finally {
      setBusy(false);
    }
  };
  const openSubmitConfirmation = () => {
    if (!form) return;
    setError('');
    const validationErrors = validateForSubmit(form);
    setFieldErrors(validationErrors);
    if (Object.keys(validationErrors).length) {
      setError('请补充或修正下方标红的必填信息后再提交。');
      return;
    }
    setConfirmingSubmit(true);
  };
  const confirmSubmit = async () => {
    if (await action('submit')) setConfirmingSubmit(false);
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
  const editable = canEditBooking && ['DRAFT', 'REVISION_REQUIRED'].includes(booking.status);
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
                {canSubmitBooking ? (
                  <button
                    className={secondary}
                    disabled={busy}
                    onClick={() => void action('cancel')}
                  >
                    删除草稿
                  </button>
                ) : null}
                <button className={secondary} disabled={busy} onClick={() => void save()}>
                  保存草稿
                </button>
                {canSubmitBooking ? (
                  <button className={primary} disabled={busy} onClick={openSubmitConfirmation}>
                    提交订舱
                  </button>
                ) : null}
              </>
            ) : canSubmitBooking &&
              ['SUBMITTED', 'APPROVED', 'BOOKING_SUBMITTED'].includes(booking.status) ? (
              <button className={secondary} disabled={busy} onClick={() => void action('cancel')}>
                取消订舱
              </button>
            ) : null}
          </div>
        }
      />
      <BookingProgressStatus booking={booking} />
      {error ? (
        <div className="rounded border border-danger/20 bg-danger/10 px-4 py-3 text-sm text-danger">
          {error}
        </div>
      ) : null}
      <section className="grid gap-4 rounded border border-border bg-surface p-4 sm:grid-cols-4">
        <Fact label="状态">
          <StatusBadge tone={bookingStatusTone(booking.status)}>
            {customerBookingStatusLabel(booking.status)}
          </StatusBadge>
        </Fact>
        <Fact label="船司" value={booking.carrierCode ?? '—'} />
        <Fact label="ETD" value={booking.etd?.slice(0, 10) ?? '待确认'} />
        <Fact label="状态备注" value={booking.lastStatusRemark ?? '—'} />
      </section>
      <section className="rounded border border-primary/20 bg-primary/5 p-5">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="font-semibold">来源报价</h2>
            <p className="mt-1 text-sm text-muted">
              本次订舱基于已接受报价 {booking.quote?.quoteNo ?? booking.quoteId ?? '—'}
              ，以下商务条件不可修改。
            </p>
          </div>
          {booking.quoteId ? (
            <Link
              className="text-sm font-semibold text-primary hover:underline"
              href={`/portal/quotes/${booking.quoteId}`}
            >
              {booking.quote?.quoteNo ?? '查看报价'} →
            </Link>
          ) : null}
        </div>
        <dl className="mt-4 grid gap-4 text-sm sm:grid-cols-4">
          <Fact label="航线" value={`${booking.polCode} → ${booking.podCode}`} />
          <Fact label="船司" value={booking.carrierCode ?? '—'} />
          <Fact label="ETD" value={booking.etd?.slice(0, 10) ?? '待确认'} />
          <Fact label="箱型与箱量" value={formatContainerRequests(booking.containerRequests)} />
        </dl>
        {booking.quote ? (
          <p className="mt-3 text-sm text-muted">
            报价摘要：{booking.quote.currency}{' '}
            {Number(booking.quote.totalAmount).toLocaleString('zh-CN', {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2,
            })}
          </p>
        ) : null}
      </section>
      <section className="space-y-5 rounded border border-border bg-surface p-5">
        <div className="rounded bg-sidebar px-3 py-2 text-sm text-muted">
          请补充本次订舱所需的货物及联系人信息。
          <RequiredLegend>字段为提交订舱前必须填写</RequiredLegend>
          ，联系人邮箱和电话至少填写一项。
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <h2 className="text-sm font-semibold sm:col-span-2">货物信息</h2>
          <Field label="货物品名" required error={fieldErrors.commodity}>
            <input
              className={inputClass(fieldErrors.commodity)}
              disabled={!editable}
              value={form.commodity ?? ''}
              onChange={(e) => change('commodity', e.target.value)}
            />
          </Field>
          <Field label="包装类型" required error={fieldErrors.packageType}>
            <select
              className={inputClass(fieldErrors.packageType)}
              disabled={!editable}
              value={form.packageType ?? ''}
              onChange={(e) => change('packageType', e.target.value)}
            >
              <option value="">请选择</option>
              {['CARTON', 'PALLET', 'CASE', 'BAG', 'DRUM', 'PACKAGE', 'OTHER'].map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>
          </Field>
          <Field label="包装数量" required error={fieldErrors.packages}>
            <input
              className={inputClass(fieldErrors.packages)}
              disabled={!editable}
              min="1"
              type="number"
              value={form.packages ?? ''}
              onChange={(e) => change('packages', e.target.value)}
            />
          </Field>
          <Field label="预计货好日期" required error={fieldErrors.cargoReadyDate}>
            <input
              className={inputClass(fieldErrors.cargoReadyDate)}
              disabled={!editable}
              type="date"
              value={form.cargoReadyDate?.slice(0, 10) ?? ''}
              onChange={(e) => change('cargoReadyDate', e.target.value)}
            />
          </Field>
          <Field label="毛重 KG" required error={fieldErrors.grossWeight}>
            <input
              className={inputClass(fieldErrors.grossWeight)}
              disabled={!editable}
              inputMode="decimal"
              value={form.grossWeight ?? ''}
              onChange={(e) => change('grossWeight', e.target.value)}
            />
          </Field>
          <Field label="体积 CBM" error={fieldErrors.volumeCbm}>
            <input
              className={inputClass(fieldErrors.volumeCbm)}
              disabled={!editable}
              inputMode="decimal"
              value={form.volumeCbm ?? ''}
              onChange={(e) => change('volumeCbm', e.target.value)}
            />
          </Field>
        </div>
        <div className="grid gap-4 border-t border-border pt-5 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <h2 className="text-sm font-semibold">
              <FieldLabel label="发货人 Shipper" required />
            </h2>
            <p className="mt-1 text-sm text-muted">
              可选择常用发货人自动带入，也可以新建本票发货人。
            </p>
          </div>
          <Field label="选择常用发货人">
            <select
              className={input}
              disabled={!editable}
              value={form.sourceShipperId ?? ''}
              onChange={(e) => selectShipper(e.target.value)}
            >
              <option value="">+ 新建发货人</option>
              {shippers.map((shipper) => (
                <option key={shipper.id} value={shipper.id}>
                  {shipper.name}
                  {shipper.isDefault ? '（默认）' : ''}
                </option>
              ))}
            </select>
          </Field>
          {form.sourceShipperId ? (
            <div className="rounded border border-border bg-sidebar px-3 py-2 text-sm text-muted">
              {formatSelectedShipper(shippers.find((item) => item.id === form.sourceShipperId))}
            </div>
          ) : editable ? (
            <label className="flex items-center gap-2 self-end text-sm">
              <input
                checked={saveShipperToAddressBook}
                disabled={busy}
                type="checkbox"
                onChange={(e) => setSaveShipperToAddressBook(e.target.checked)}
              />
              保存到常用发货人
            </label>
          ) : null}
          <Field label="发货人名称" required error={fieldErrors.shipperName}>
            <input
              className={inputClass(fieldErrors.shipperName)}
              disabled={!editable}
              value={form.shipperName ?? ''}
              onChange={(e) => change('shipperName', e.target.value)}
            />
          </Field>
          <Field label="发货人地址" required error={fieldErrors.shipperAddress}>
            <textarea
              className={`${inputClass(fieldErrors.shipperAddress)} min-h-24 py-2`}
              disabled={!editable}
              value={form.shipperAddress ?? ''}
              onChange={(e) => change('shipperAddress', e.target.value)}
            />
          </Field>
          {editable && form.sourceShipperId ? (
            <div className="flex flex-wrap gap-2 sm:col-span-2">
              <button
                className={secondary}
                disabled={busy}
                onClick={() =>
                  void updateSelectedShipper({
                    name: form.shipperName,
                    address: form.shipperAddress,
                  })
                }
                type="button"
              >
                更新所选发货人
              </button>
              <button
                className={secondary}
                disabled={
                  busy || shippers.find((item) => item.id === form.sourceShipperId)?.isDefault
                }
                onClick={() => void updateSelectedShipper({ isDefault: true })}
                type="button"
              >
                设为默认
              </button>
              <button
                className="h-9 rounded border border-danger/30 px-4 text-sm font-semibold text-danger disabled:opacity-40"
                disabled={busy}
                onClick={() => void updateSelectedShipper({ status: 'INACTIVE' })}
                type="button"
              >
                停用
              </button>
            </div>
          ) : null}
        </div>
        <div className="grid gap-4 border-t border-border pt-5 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <h2 className="text-sm font-semibold">订舱联系人 Booking Contact</h2>
            <p className="mt-1 text-sm text-muted">用于接收本票订舱进度、SO 等业务通知。</p>
          </div>
          <Field label="联系人" required error={fieldErrors.bookingContactName}>
            <input
              className={inputClass(fieldErrors.bookingContactName)}
              disabled={!editable}
              value={form.bookingContactName ?? ''}
              onChange={(e) => change('bookingContactName', e.target.value)}
            />
          </Field>
          <Field label="联系人邮箱" error={fieldErrors.bookingContact}>
            <input
              className={inputClass(fieldErrors.bookingContact)}
              disabled={!editable}
              type="email"
              value={form.bookingContactEmail ?? ''}
              onChange={(e) => change('bookingContactEmail', e.target.value)}
            />
          </Field>
          <Field label="联系人电话" error={fieldErrors.bookingContact}>
            <input
              className={inputClass(fieldErrors.bookingContact)}
              disabled={!editable}
              value={form.bookingContactPhone ?? ''}
              onChange={(e) => change('bookingContactPhone', e.target.value)}
            />
          </Field>
        </div>
        <div className="space-y-3 border-t border-border pt-5">
          <label className="flex items-center gap-2 text-sm font-medium">
            <input
              checked={form.isDangerousGoods}
              disabled={!editable}
              type="checkbox"
              onChange={(e) => change('isDangerousGoods', e.target.checked)}
            />
            危险品
          </label>
          {form.isDangerousGoods ? (
            <div className="rounded border border-warning/30 bg-warning/10 p-3 text-sm text-warning">
              <p className="font-semibold">危险品订舱需要额外审核。</p>
              <p className="mt-1 text-xs">
                请在特殊要求中填写危险品品名、UN No.、IMO Class 和 MSDS 资料状态。当前 V1
                尚未提供独立 MSDS 上传字段，提交后操作员将进一步确认危险品资料。
              </p>
              {fieldErrors.dangerousGoodsInfo ? (
                <p className="mt-2 text-sm text-danger">{fieldErrors.dangerousGoodsInfo}</p>
              ) : null}
            </div>
          ) : null}
        </div>
        <Field label="特殊要求（选填）" wide>
          <textarea
            className={`${inputClass(fieldErrors.dangerousGoodsInfo)} min-h-24 py-2`}
            disabled={!editable}
            maxLength={2000}
            placeholder="例如：指定船期要求、装柜要求、特殊操作说明等"
            value={form.specialInstructions ?? ''}
            onChange={(e) => change('specialInstructions', e.target.value)}
          />
        </Field>
      </section>
      {editable && !documents.length && !booking.shipments.length ? null : (
        <section className="rounded border border-border bg-surface p-5">
          <h2 className="font-semibold">SO 与 Shipment</h2>
          <div className="mt-3 space-y-2 text-sm">
            {soRecords.map((record) => (
              <div className="rounded border border-border p-3" key={record.id}>
                <div className="font-semibold">
                  SO {record.soNumber} · V{record.version}
                </div>
                <div className="mt-1 text-muted">
                  船名/航次：{record.vessel ?? '—'} / {record.voyage ?? '—'} · 码头：
                  {record.terminal ?? '—'}
                </div>
                <div className="text-muted">
                  截关：CY {formatDateTime(record.cyCutoffAt)} · SI{' '}
                  {formatDateTime(record.siCutoffAt)} · VGM {formatDateTime(record.vgmCutoffAt)}
                </div>
              </div>
            ))}
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
      )}
      {canSubmitBooking && confirmingSubmit ? (
        <div
          aria-labelledby="submit-booking-title"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/35 p-4"
          role="dialog"
        >
          <div className="w-full max-w-lg rounded border border-border bg-surface shadow-xl">
            <div className="border-b border-border px-5 py-4">
              <h2 className="text-base font-semibold" id="submit-booking-title">
                确认提交订舱
              </h2>
              <p className="mt-1 text-sm text-muted">
                提交后将发送给货代操作团队审核，当前草稿将不能继续编辑。
              </p>
            </div>
            <dl className="grid grid-cols-[110px_1fr] gap-x-3 gap-y-2 px-5 py-4 text-sm">
              <dt className="text-muted">提交给</dt>
              <dd className="font-semibold text-primary">货代操作团队（Operation）</dd>
              <dt className="text-muted">订舱编号</dt>
              <dd className="font-medium">{booking.bookingNo}</dd>
              <dt className="text-muted">航线</dt>
              <dd>
                {booking.polCode} → {booking.podCode}
              </dd>
              <dt className="text-muted">箱量需求</dt>
              <dd>{formatContainerRequests(form.containerRequests)}</dd>
              <dt className="text-muted">货物</dt>
              <dd>{form.commodity}</dd>
            </dl>
            <div className="rounded bg-sidebar px-5 py-3 text-sm text-muted">
              操作团队审核后会确认或拒绝订舱；确认后将继续处理 SO 和 Shipment。
            </div>
            <div className="flex justify-end gap-2 border-t border-border px-5 py-4">
              <button
                className={secondary}
                disabled={busy}
                onClick={() => setConfirmingSubmit(false)}
                type="button"
              >
                返回检查
              </button>
              <button
                className={primary}
                disabled={busy}
                onClick={() => void confirmSubmit()}
                type="button"
              >
                {busy ? '提交中…' : '确认提交给操作团队'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
function BookingProgressStatus({ booking }: { booking: Booking }) {
  const config = bookingProgressStatusConfig(booking.status);
  const Icon = config.icon;
  return (
    <section className={`rounded border px-4 py-3 ${config.panelClass}`}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3">
          <span
            className={`mt-0.5 grid size-9 shrink-0 place-items-center rounded ${config.iconClass}`}
          >
            <Icon aria-hidden className="size-5" />
          </span>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <StatusBadge tone={bookingStatusTone(booking.status)}>
                {customerBookingStatusLabel(booking.status)}
              </StatusBadge>
              <span className="text-sm font-semibold">{config.title}</span>
            </div>
            <p className="mt-1 text-sm leading-6 text-muted">{config.description}</p>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-sm sm:text-right">
          <Fact label="航线" value={`${booking.polCode} → ${booking.podCode}`} />
          <Fact
            label="箱量"
            value={formatContainerRequests(booking.containerRequests) || '待确认'}
          />
        </div>
      </div>
    </section>
  );
}
function bookingProgressStatusConfig(status: string) {
  if (status === 'DRAFT')
    return {
      icon: Clock,
      title: '订舱资料待提交',
      description: '请补充货物、发货人和联系人信息，确认无误后提交给操作团队。',
      panelClass: 'border-warning/25 bg-warning/10',
      iconClass: 'bg-warning/10 text-warning',
    };
  if (status === 'REVISION_REQUIRED')
    return {
      icon: AlertTriangle,
      title: '需要补充订舱资料',
      description: '操作团队已退回补充，请根据状态备注修正后重新提交。',
      panelClass: 'border-warning/25 bg-warning/10',
      iconClass: 'bg-warning/10 text-warning',
    };
  if (status === 'SUBMITTED')
    return {
      icon: CheckCircle2,
      title: '订舱已发送给操作团队',
      description: '提交成功。操作团队会审核资料并继续确认订舱安排。',
      panelClass: 'border-success/20 bg-success/5',
      iconClass: 'bg-success/10 text-success',
    };
  if (status === 'APPROVED')
    return {
      icon: FileCheck2,
      title: '订舱资料已通过审核',
      description: '操作团队正在向承运方提交订舱，后续会更新 SO 信息。',
      panelClass: 'border-primary/20 bg-primary/5',
      iconClass: 'bg-primary/10 text-primary',
    };
  if (status === 'BOOKING_SUBMITTED')
    return {
      icon: FileCheck2,
      title: '已提交承运方，等待 SO',
      description: '订舱已由操作团队提交给承运方，SO 放出后会在本页展示。',
      panelClass: 'border-primary/20 bg-primary/5',
      iconClass: 'bg-primary/10 text-primary',
    };
  if (status === 'BOOKED')
    return {
      icon: CheckCircle2,
      title: '订舱已完成',
      description: '订舱已确认，后续可继续查看 SO、Shipment 和出运跟踪。',
      panelClass: 'border-success/20 bg-success/5',
      iconClass: 'bg-success/10 text-success',
    };
  if (status === 'REJECTED')
    return {
      icon: AlertTriangle,
      title: '订舱已拒绝',
      description: '该订舱未通过审核，请查看状态备注并联系操作团队。',
      panelClass: 'border-danger/20 bg-danger/5',
      iconClass: 'bg-danger/10 text-danger',
    };
  if (status === 'CANCELLED')
    return {
      icon: AlertTriangle,
      title: '订舱已取消',
      description: '该订舱已取消，不会继续进入后续操作流程。',
      panelClass: 'border-border bg-sidebar',
      iconClass: 'bg-surface text-muted',
    };
  return {
    icon: FileCheck2,
    title: '订舱状态已更新',
    description: '请根据当前状态继续处理后续流程。',
    panelClass: 'border-border bg-surface',
    iconClass: 'bg-sidebar text-muted',
  };
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
  required,
  error,
  wide,
  children,
}: {
  label: string;
  required?: boolean;
  error?: string;
  wide?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className={wide ? 'sm:col-span-2' : ''}>
      <span className="mb-1 block text-sm font-medium">
        <FieldLabel label={label} required={required} />
      </span>
      {children}
      {error ? <span className="mt-1 block text-sm text-danger">{error}</span> : null}
    </label>
  );
}
const input =
  'h-10 w-full rounded border border-border bg-surface px-3 text-sm disabled:bg-sidebar';
const inputClass = (error?: string) =>
  `${input} ${error ? 'border-danger bg-danger/5 ring-1 ring-danger/20' : ''}`;
const primary =
  'h-9 rounded bg-primary px-4 text-sm font-semibold text-surface disabled:opacity-40';
const secondary = 'h-9 rounded border border-border px-4 text-sm font-semibold disabled:opacity-40';

function validateForSubmit(form: Booking): FieldErrors {
  const errors: FieldErrors = {};
  if (!form.commodity?.trim()) errors.commodity = '请输入货物品名。';
  if (!form.packageType) errors.packageType = '请选择包装类型。';
  if (!Number.isInteger(Number(form.packages)) || Number(form.packages) < 1)
    errors.packages = '请输入大于或等于 1 的整数。';
  if (!isPositiveDecimal(form.grossWeight)) errors.grossWeight = '请输入大于 0 的毛重。';
  if (form.volumeCbm && !isPositiveDecimal(form.volumeCbm))
    errors.volumeCbm = '体积如填写，必须大于 0。';
  if (!form.cargoReadyDate) errors.cargoReadyDate = '请选择预计货好日期。';
  if (!form.shipperName?.trim()) errors.shipperName = '请输入发货人名称。';
  if (!form.shipperAddress?.trim()) errors.shipperAddress = '请输入发货人地址。';
  if (!form.bookingContactName?.trim()) errors.bookingContactName = '请输入订舱联系人。';
  if (!form.bookingContactEmail?.trim() && !form.bookingContactPhone?.trim())
    errors.bookingContact = '联系人邮箱和电话至少填写一项。';
  if (form.bookingContactEmail && !/^\S+@\S+\.\S+$/.test(form.bookingContactEmail))
    errors.bookingContact = '请输入有效的联系人邮箱。';
  if (form.isDangerousGoods && !form.specialInstructions?.trim())
    errors.dangerousGoodsInfo = '危险品订舱请填写危险品品名、UN No.、IMO Class 和 MSDS 资料状态。';
  if (
    !form.containerRequests.length ||
    form.containerRequests.some(
      (item) => !item.containerType.trim() || !Number.isInteger(item.quantity) || item.quantity < 1,
    )
  )
    errors.containerRequests = '请至少填写一条有效的箱型和箱量，箱量必须大于或等于 1。';
  return errors;
}

function isPositiveDecimal(value: string | null) {
  return Boolean(value && /^\d{1,14}(?:\.\d{1,4})?$/.test(value) && Number(value) > 0);
}

function mapMissingFields(missing: string[] = []): FieldErrors {
  const labels: Record<string, [keyof FieldErrors, string]> = {
    commodity: ['commodity', '请输入品名。'],
    packageType: ['packageType', '请选择包装类型。'],
    packages: ['packages', '请输入件数。'],
    grossWeight: ['grossWeight', '请输入毛重。'],
    volumeCbm: ['volumeCbm', '体积如填写，必须大于 0。'],
    volumeCbmPositive: ['volumeCbm', '体积如填写，必须大于 0。'],
    cargoReadyDate: ['cargoReadyDate', '请选择预计货好日期。'],
    shipperName: ['shipperName', '请输入发货人名称。'],
    shipperAddress: ['shipperAddress', '请输入发货人地址。'],
    bookingContactName: ['bookingContactName', '请输入订舱联系人。'],
    bookingContactEmailOrPhone: ['bookingContact', '联系人邮箱和电话至少填写一项。'],
    containerRequests: ['containerRequests', '请至少填写一条箱量需求。'],
    dangerousGoodsInfo: [
      'dangerousGoodsInfo',
      '危险品订舱请填写危险品品名、UN No.、IMO Class 和 MSDS 资料状态。',
    ],
  };
  return missing.reduce<FieldErrors>((result, field) => {
    const mapped = labels[field];
    if (mapped) result[mapped[0]] = mapped[1];
    return result;
  }, {});
}

function mapServerFieldErrors(payload?: ApiErrorPayload): FieldErrors {
  const mapped = mapMissingFields(payload?.details?.missing);
  const fieldErrors = payload?.details?.fieldErrors;
  if (!fieldErrors) return mapped;
  const labels: Record<string, [keyof FieldErrors, string]> = {
    commodity: ['commodity', '请输入货物品名。'],
    packageType: ['packageType', '请选择包装类型。'],
    packages: ['packages', '请输入大于或等于 1 的整数。'],
    grossWeight: ['grossWeight', '请输入大于 0 的毛重。'],
    volumeCbm: ['volumeCbm', '体积如填写，必须大于 0。'],
    cargoReadyDate: ['cargoReadyDate', '请选择有效预计货好日期。'],
    sourceShipperId: ['shipperName', '请选择当前客户公司的有效发货人。'],
    shipperName: ['shipperName', '请输入发货人名称。'],
    shipperAddress: ['shipperAddress', '请输入发货人地址。'],
    bookingContactName: ['bookingContactName', '请输入订舱联系人。'],
    bookingContactEmail: ['bookingContact', '请输入有效联系人邮箱。'],
    bookingContactPhone: ['bookingContact', '联系人电话不能超过 50 个字符。'],
    bookingContact: ['bookingContact', '联系人邮箱和电话至少填写一项。'],
    dangerousGoodsInfo: [
      'dangerousGoodsInfo',
      '危险品订舱请填写危险品品名、UN No.、IMO Class 和 MSDS 资料状态。',
    ],
    specialInstructions: ['dangerousGoodsInfo', '特殊要求不能超过 2000 个字符。'],
    containerRequests: ['containerRequests', '请至少填写一条箱量需求。'],
  };
  for (const field of Object.keys(fieldErrors)) {
    const normalized = field.replace(/\[(\d+)\]/g, '.$1');
    const mappedField = labels[normalized] ?? labels[normalized.split('.')[0] ?? ''];
    if (mappedField) mapped[mappedField[0]] = mappedField[1];
  }
  return mapped;
}

function formatApiError(payload: ApiErrorPayload, fallback: string) {
  if (payload.code === 'BOOKING_INCOMPLETE') return '订舱资料不完整，请检查标红的必填项。';
  if (payload.code === 'SHIPPER_NOT_IN_CUSTOMER_SCOPE') return '请选择当前客户公司的有效发货人。';
  if (payload.code === 'BOOKING_GROSS_WEIGHT_INVALID') return '毛重必须大于 0。';
  if (payload.code === 'BOOKING_VOLUME_CBM_INVALID') return '体积如填写，必须大于 0。';
  const firstValidationError = payload.details?.errors?.[0];
  if (firstValidationError) return '资料校验失败，请检查标红字段。';
  return payload.message ?? fallback;
}

function toBookingApiError(error: unknown): BookingApiError {
  return error instanceof BookingApiError
    ? error
    : new BookingApiError(error instanceof Error ? error.message : '操作失败。');
}

function formatContainerRequests(items: Container[]) {
  return items.map((item) => `${item.quantity} × ${item.containerType}`).join('、');
}

function formatSelectedShipper(shipper?: CustomerShipper) {
  if (!shipper) return '已选择常用发货人。';
  const contact = [shipper.contactName, shipper.contactEmail, shipper.contactPhone]
    .filter(Boolean)
    .join(' / ');
  return contact ? `已带入：${shipper.name}，${contact}` : `已带入：${shipper.name}`;
}

function formatDateTime(value: string | null) {
  return value ? new Date(value).toLocaleString('zh-CN') : '—';
}

function optionalText(value: string | null) {
  const trimmed = value?.trim();
  return trimmed || undefined;
}
