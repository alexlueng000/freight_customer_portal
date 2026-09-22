'use client';
import { confirmationTimeToIso, confirmationTimeInput, formatConfirmationTime, cutoffHint } from '@/lib/booking-confirmation-time';
import { BookingCommission } from '@/components/booking-commission';
import { ShipmentConfirmationDifference } from '@/components/shipment-confirmation-difference';
import { quoteAmounts } from '@/lib/quote-amounts';
import { AlertTriangle, CheckCircle2, Ship } from 'lucide-react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '@/components/auth-provider';
import { BusinessFlow } from '@/components/business-flow';
import { ErrorState } from '@/components/error-state';
import { LoadingState } from '@/components/loading-state';
import { PageHeader } from '@/components/page-header';
import { FieldLabel } from '@/components/required-mark';
import { StatusBadge } from '@/components/status-badge';
import { bookingStatusLabel, bookingStatusTone } from '@/lib/booking-status';
import { hasPermission } from '@/lib/auth';
import { resolveBookingBusinessFlow } from '@/lib/business-flow';

interface BookingCargoItem {
  id: string;
  sourceQuoteCargoItemId: string | null;
  commodity: string;
  estimatedGrossWeight: string | null;
  cargoNature: string | null;
  specialRequirement: string | null;
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
  specialInstructions: string | null;
  isDangerousGoods: boolean;
  shipperName: string | null;
  shipperAddress: string | null;
  bookingContactName: string | null;
  bookingContactEmail: string | null;
  bookingContactPhone: string | null;
  lastStatusRemark: string | null;
  createdAt: string;
  customer: { name: string };
  quote: {
    quoteNo: string;
    polCode: string;
    podCode: string;
    carrierCode: string | null;
    etd: string | null;
    currency: string;
    totalAmount: string;
    amountsByCurrency?: Record<string, string>;
    sourceRate: { polName: string; podName: string; serviceName: string | null } | null;
    items: Array<{ containerType: string | null; quantity: string }>;
  } | null;
  containerRequests: Array<{
    id: string;
    containerType: string;
    quantity: number;
    weightPerContainer: string | null;
    remark: string | null;
  }>;
  cargoItems: BookingCargoItem[];
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
  reviewIssues: ReviewIssue[];
}
interface ReviewIssue {
  code: string;
  severity: 'error' | 'warning';
  message: string;
  field: string;
  blocking: boolean;
  details?: Record<string, string | null>;
}
interface SoRecord {
  id: string;
  soNumber: string;
  sourceType: string;
  sourceName: string | null;
  carrierCode: string | null;
  vessel: string | null;
  voyage: string | null;
  etd: string | null;
  eta: string | null;
  receivedAt: string;
  publishedAt: string | null;
  createdAt: string;
  cyCutoffAt: string | null;
  siCutoffAt: string | null;
  vgmCutoffAt: string | null;
  terminal: string | null;
  version: number;
  status: 'INTERNAL_DRAFT' | 'PUBLISHED' | 'SUPERSEDED';
  uploadedBy: { displayName: string } | null;
  publishedBy: { displayName: string } | null;
  document: { id: string; originalFilename: string; customerVisible: boolean; status?: string };
}
interface ApiErrorPayload {
  code?: string;
  message?: string;
  details?: {
    errors?: string[];
    reviewIssues?: ReviewIssue[];
    fieldErrors?: Record<string, string[]>;
  };
}
type SoFieldErrors = Partial<
  Record<
    | 'file'
    | 'soNumber'
    | 'sourceType'
    | 'sourceName'
    | 'carrierCode'
    | 'vessel'
    | 'voyage'
    | 'etd'
    | 'eta' | 'cyCutoffAt' | 'siCutoffAt' | 'vgmCutoffAt' | 'terminal' | 'receivedAt',
    string
  >
>;
type OperationNotice = {
  tone: 'success' | 'danger';
  title: string;
  description: string;
};
export default function AdminBookingDetail() {
  const { id } = useParams<{ id: string }>();
  const { apiFetch, user } = useAuth();
  const [b, setB] = useState<Booking | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [operationNotice, setOperationNotice] = useState<OperationNotice | null>(null);
  const [dialog, setDialog] = useState<
    | 'approve'
    | 'revision'
    | 'reject'
    | 'carrier'
    | 'register-so'
    | 'publish-so'
    | 'create-shipment'
    | null
  >(null);
  const [remark, setRemark] = useState('');
  const [reasonCode, setReasonCode] = useState('CARGO_INCOMPLETE');
  const [sourceName, setSourceName] = useState('');
  const [reference, setReference] = useState('');
  const [publishingSoId, setPublishingSoId] = useState<string | null>(null);
  const [soRecords, setSoRecords] = useState<SoRecord[]>([]);
  const [soFile, setSoFile] = useState<File | null>(null);
  const [soNumber, setSoNumber] = useState('');
  const [soSourceType, setSoSourceType] = useState('CARRIER');
  const [soSourceName, setSoSourceName] = useState('');
  const [soVessel, setSoVessel] = useState('');
  const [soVoyage, setSoVoyage] = useState('');
  const [soEtd, setSoEtd] = useState('');
  const [replacingSoId, setReplacingSoId] = useState<string | null>(null);
  const [soDetails, setSoDetails] = useState({
    eta: '',
    cyCutoffAt: '',
    siCutoffAt: '',
    vgmCutoffAt: '',
    terminal: '',
    receivedAt: '',
    carrierCode: '',
  });
  const [soOffset, setSoOffset] = useState('+08:00');
  const [soFieldErrors, setSoFieldErrors] = useState<SoFieldErrors>({});
  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [bookingResponse, soResponse] = await Promise.all([
        apiFetch(`/api/v1/admin/bookings/${id}`),
        apiFetch(`/api/v1/admin/bookings/${id}/so-records`),
      ]);
      const p = (await bookingResponse.json()) as Booking & {
        details?: { reviewIssues?: ReviewIssue[] };
        message?: string;
      };
      if (!bookingResponse.ok) throw new Error(p.message ?? '订舱详情加载失败。');
      const soPayload = (await soResponse.json()) as SoRecord[] & { message?: string };
      if (!soResponse.ok) throw new Error(soPayload.message ?? '订舱确认单记录加载失败。');
      setB(p);
      setSoRecords(soPayload);
    } catch (e) {
      setB(null);
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
    setOperationNotice(null);
    try {
      const r = await apiFetch(`/api/v1/admin/bookings/${id}/${action}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
      const p = (await r.json()) as ApiErrorPayload;
      if (!r.ok) throw new Error(formatActionError(p));
      setRemark('');
      setSourceName('');
      setReference('');
      setPublishingSoId(null);
      setDialog(null);
      await load();
    } catch (e) {
      setError((e as { message?: string }).message ?? '操作失败。');
    } finally {
      setBusy(false);
    }
  };
  const uploadSo = async () => {
    const clientErrors: SoFieldErrors = {
      ...(!soFile ? { file: '请选择订舱确认单文件。' } : {}),
      ...(!soNumber.trim() ? { soNumber: '请输入订舱确认单编号' } : {}),
    };
    if (!soDetails.receivedAt) clientErrors.receivedAt = '请输入实际收到订舱确认单的时间。';
    for (const key of ['receivedAt', 'eta', 'cyCutoffAt', 'siCutoffAt', 'vgmCutoffAt'] as const) {
      if (soDetails[key]) {
        try {
          confirmationTimeToIso(soDetails[key], soOffset);
        } catch {
          clientErrors[key] = '请输入有效日期和时间。';
        }
      }
    }
    if (soEtd) {
      try {
        confirmationTimeToIso(soEtd, soOffset);
      } catch {
        clientErrors.etd = '请输入有效日期和时间。';
      }
    }
    setSoFieldErrors(clientErrors);
    if (Object.keys(clientErrors).length) return;
    if (!soFile) return;
    const submittedSoNumber = soNumber.trim();
    setBusy(true);
    setError('');
    setOperationNotice(null);
    try {
      const form = new FormData();
      form.append('file', soFile);
      form.append('soNumber', submittedSoNumber);
      form.append('sourceType', soSourceType);
      for (const key of ['receivedAt', 'eta', 'cyCutoffAt', 'siCutoffAt', 'vgmCutoffAt'] as const) {
        if (soDetails[key]) form.append(key, confirmationTimeToIso(soDetails[key], soOffset));
      }
      if (soDetails.terminal.trim()) form.append('terminal', soDetails.terminal.trim());
      if (soSourceName.trim()) form.append('sourceName', soSourceName.trim());
      if (soDetails.carrierCode.trim()) form.append('carrierCode', soDetails.carrierCode.trim());
      if (soVessel.trim()) form.append('vessel', soVessel.trim());
      if (soVoyage.trim()) form.append('voyage', soVoyage.trim());
      if (soEtd) form.append('etd', confirmationTimeToIso(soEtd, soOffset));
      const response = await apiFetch(
        `/api/v1/admin/bookings/${id}/so-records${replacingSoId ? `/${replacingSoId}/replace` : ''}`,
        {
          method: 'POST',
          body: form,
        },
      );
      const payload = (await response.json()) as ApiErrorPayload;
      if (!response.ok) {
        setSoFieldErrors(mapSoFieldErrors(payload));
        throw new Error(formatSoError(payload));
      }
      setSoFile(null);
      setSoNumber('');
      setSoVessel('');
      setSoVoyage('');
      setSoEtd('');
      setSoFieldErrors({});
      setDialog(null);
      await load();
      setOperationNotice({
        tone: 'success',
        title: '订舱确认单已登记成功',
        description: `订舱确认单${submittedSoNumber} 已保存为内部记录，现在可以创建出运记录。客户暂不可见此订舱确认单，发布后才能查看和下载。`,
      });
    } catch (caught) {
      const message = (caught as Error).message;
      setError(message);
      setOperationNotice({
        tone: 'danger',
        title: '订舱确认单登记失败',
        description: message,
      });
    } finally {
      setBusy(false);
    }
  };
  const publishSo = async (soId: string) => {
    setBusy(true);
    setError('');
    setOperationNotice(null);
    const soNumberToPublish = soRecords.find((record) => record.id === soId)?.soNumber;
    try {
      const response = await apiFetch(`/api/v1/admin/bookings/${id}/so-records/${soId}/publish`, {
        method: 'POST',
      });
      const payload = (await response.json()) as { message?: string };
      if (!response.ok) throw new Error(payload.message ?? '订舱确认单发布失败。');
      setPublishingSoId(null);
      setDialog(null);
      await load();
      setOperationNotice({
        tone: 'success',
        title: '订舱确认单已发布给客户',
        description: `订舱确认单${soNumberToPublish ?? ''} 已设为客户可见，客户现在可以在订舱详情查看和下载。创建出运记录后，客户出运列表才会显示。`,
      });
    } catch (caught) {
      const message = (caught as Error).message;
      setError(message);
      setOperationNotice({
        tone: 'danger',
        title: '订舱确认单发布失败',
        description: message,
      });
    } finally {
      setBusy(false);
    }
  };
  const createShipment = async () => {
    if (!currentSo || !['INTERNAL_DRAFT', 'PUBLISHED'].includes(currentSo.status)) return;
    setBusy(true);
    setError('');
    setOperationNotice(null);
    try {
      const body = { soRecordId: currentSo.id };
      const response = await apiFetch(`/api/v1/admin/bookings/${id}/shipments`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
      const payload = (await response.json()) as { shipmentNo?: string; message?: string };
      if (!response.ok) throw new Error(payload.message ?? '出运记录创建失败。');
      setDialog(null);
      await load();
      setOperationNotice({
        tone: 'success',
        title: '出运记录已创建',
        description: `${payload.shipmentNo ?? '新的出运记录'} 已关联到该订舱，客户现在可以在出运列表查看。`,
      });
    } catch (caught) {
      const message = (caught as Error).message;
      setError(message);
      setOperationNotice({
        tone: 'danger',
        title: '出运记录创建失败',
        description: message,
      });
    } finally {
      setBusy(false);
    }
  };
  const downloadDocument = async (document: { id: string; originalFilename: string }) => {
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
  const canManage = hasPermission(user, 'booking.manage');
  const canCreateShipment = hasPermission(user, 'shipment.create');
  const canUploadDocuments = hasPermission(user, 'document.upload');
  const canManageDocuments = hasPermission(user, 'document.manage');
  const reviewIssues = b.reviewIssues ?? [];
  const blockingIssues = reviewIssues.filter((issue) => issue.blocking);
  const route = routeDisplay(b);
  const quoteItems = b.quote?.items ?? [];
  const quoteContainerSummary = quoteItems.length ? formatQuoteContainers(quoteItems) : '—';
  const latestSubmission = b.reviewActions.find((action) => action.action === 'SUBMIT_TO_CARRIER');
  const currentSo = soRecords.find(record =>
    ['INTERNAL_DRAFT', 'PUBLISHED'].includes(record.status) &&
    (!record.document.status || record.document.status === 'ACTIVE'));
  const businessFlow = resolveBookingBusinessFlow(b, 'admin');
  const openCarrierDialog = () => {
    setSourceName(latestSubmission?.carrierSourceName ?? b.carrierCode ?? '');
    setReference(latestSubmission?.carrierReference ?? '');
    setRemark('');
    setDialog('carrier');
  };
  const openRegisterSoDialog = () => {
    setReplacingSoId(null);
    setSoOffset('+08:00');
    const provider = latestSubmission?.carrierSourceName ?? b.carrierCode ?? '';
    setSoNumber('');
    setSoFile(null);
    setSoSourceName(provider);
    setSoSourceType(provider && provider !== b.carrierCode ? 'AGENT' : 'CARRIER');
    setSoVessel('');
    setSoVoyage('');
    setSoEtd('');
    setSoDetails({ eta: '', cyCutoffAt: '', siCutoffAt: '', vgmCutoffAt: '', terminal: '', receivedAt: '', carrierCode: b.carrierCode ?? '' });
    setSoFieldErrors({});
    setDialog('register-so');
  };
  return (
    <div className="space-y-5">
      <Link className="text-sm text-primary hover:underline" href="/admin/bookings">
        ← 返回订舱列表
      </Link>
      <PageHeader
        eyebrow={b.customer.name}
        title={b.bookingNo}
        description={`创建时间：${formatDateTime(b.createdAt)}`}
        actions={
          <div className="flex gap-2">
            {canManage && b.status === 'SUBMITTED' ? (
              <>
                <button className={secondary} disabled={busy} onClick={() => setDialog('revision')}>
                  退回补充
                </button>
                <button
                  className={primary}
                  disabled={busy || blockingIssues.length > 0}
                  title={
                    blockingIssues.length
                      ? `存在 ${blockingIssues.length} 项必须处理的问题，暂时无法审核通过。`
                      : undefined
                  }
                  onClick={() => setDialog('approve')}
                >
                  审核通过
                </button>
              </>
            ) : null}
            {canManage && b.status === 'APPROVED' ? (
              <button className={primary} disabled={busy} onClick={openCarrierDialog}>
                提交订舱
              </button>
            ) : null}
            {canManage && ['SUBMITTED', 'APPROVED', 'BOOKING_SUBMITTED'].includes(b.status) ? (
              <button className={danger} disabled={busy} onClick={() => setDialog('reject')}>
                业务拒绝
              </button>
            ) : null}
          </div>
        }
      />
      <BusinessFlow {...businessFlow} />
      {operationNotice ? <OperationNoticeBar notice={operationNotice} /> : null}
      {error && !operationNotice ? (
        <div className="rounded border border-danger/20 bg-danger/10 px-4 py-3 text-sm text-danger">
          {error}
        </div>
      ) : null}
      <section className="rounded border border-border bg-surface p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <StatusBadge tone={bookingStatusTone(b.status)}>
                {bookingStatusLabel(b.status)}
              </StatusBadge>
              {blockingIssues.length ? (
                <StatusBadge tone="danger">{blockingIssues.length} 项阻断</StatusBadge>
              ) : b.status === 'SUBMITTED' ? (
                <StatusBadge tone="success">可审核</StatusBadge>
              ) : null}
            </div>
            <div className="mt-4 grid items-center gap-3 text-2xl font-semibold sm:grid-cols-[1fr_auto_1fr]">
              <div>
                <div>{route.polName}</div>
                <div className="mt-1 text-sm font-medium text-muted">{b.polCode}</div>
              </div>
              <div className="text-primary">→</div>
              <div>
                <div>{route.podName}</div>
                <div className="mt-1 text-sm font-medium text-muted">{b.podCode}</div>
              </div>
            </div>
          </div>
          <div className="text-right text-sm">
            <div className="font-semibold">{b.customer.name}</div>
            <div className="mt-1 text-muted">来源报价 {b.quote?.quoteNo ?? '—'}</div>
          </div>
        </div>
        <dl className="mt-5 grid gap-4 border-t border-border pt-4 text-sm sm:grid-cols-5">
          <Fact label="船司" value={b.carrierCode ?? '—'} />
          <Fact label="航线服务" value={b.quote?.sourceRate?.serviceName ?? '—'} />
          <Fact label="预计开船时间" value={formatDate(b.etd)} />
          <Fact label="预计货好日期" value={formatDate(b.cargoReadyDate)} />
          <Fact label="箱型 / 箱量" value={formatContainerRequests(b.containerRequests)} />
        </dl>
      </section>
      <ReviewIssues issues={reviewIssues} status={b.status} />
      <section className="grid items-start gap-4 lg:grid-cols-[1.15fr_0.95fr_1fr]">
        <InfoPanel
          title="货物信息"
          meta={`${b.cargoItems.length || (b.commodity ? 1 : 0)} 项 · ${b.isDangerousGoods ? '危险品' : '普货'}`}
        >
          {b.cargoItems.length ? (
            b.cargoItems.map((item, index) => (
              <div className="py-3" key={item.id}>
                <div className="flex items-center justify-between gap-3">
                  <div className="text-sm font-semibold text-primary">货物 {index + 1}</div>
                  {item.cargoNature ? (
                    <span className="text-xs text-muted">{item.cargoNature}</span>
                  ) : null}
                </div>
                <dl className="mt-1 divide-y divide-border">
                  <CompactFact label="品名" value={item.commodity} />
                  <CompactFact
                    label="预计重量"
                    value={item.estimatedGrossWeight ? `${item.estimatedGrossWeight} KG` : '—'}
                  />
                  <CompactFact label="货物性质" value={item.cargoNature ?? '—'} />
                  <CompactFact label="特殊要求" value={item.specialRequirement ?? '无'} wide />
                </dl>
              </div>
            ))
          ) : (
            <dl>
              <CompactFact label="品名" value={b.commodity ?? '—'} />
              <CompactFact label="毛重" value={b.grossWeight ? `${b.grossWeight} KG` : '—'} />
            </dl>
          )}
          <div className="py-3">
            <div className="text-sm font-semibold">订舱汇总</div>
            <dl className="mt-1 divide-y divide-border">
              <CompactFact label="包装" value={formatPackage(b)} />
              <CompactFact label="总体积" value={b.volumeCbm ? `${b.volumeCbm} CBM` : '—'} />
              <CompactFact label="货好日期" value={formatDate(b.cargoReadyDate)} />
              <CompactFact
                label="危险品"
                value={b.isDangerousGoods ? '是，需要资料核对' : '否'}
                tone={b.isDangerousGoods ? 'warning' : 'default'}
              />
              {b.specialInstructions ? (
                <CompactFact label="订舱特殊说明" value={b.specialInstructions} wide />
              ) : null}
            </dl>
          </div>
        </InfoPanel>
        <InfoPanel title="发货人">
          <CompactFact label="公司名称" value={b.shipperName ?? '—'} />
          <CompactFact label="地址" value={b.shipperAddress ?? '—'} wide />
        </InfoPanel>
        <InfoPanel
          title="订舱联系人"
          meta={b.bookingContactEmail || b.bookingContactPhone ? '可联系' : '缺少联系方式'}
        >
          <CompactFact label="姓名" value={b.bookingContactName ?? '—'} />
          {b.bookingContactEmail ? (
            <CompactFact label="邮箱" value={b.bookingContactEmail} />
          ) : null}
          {b.bookingContactPhone ? (
            <CompactFact label="电话" value={b.bookingContactPhone} />
          ) : null}
          {!b.bookingContactEmail && !b.bookingContactPhone ? (
            <div className="rounded border border-danger/20 bg-danger/10 px-3 py-2 text-sm text-danger">
              缺少可联系的邮箱或电话。
            </div>
          ) : null}
        </InfoPanel>
      </section>
      {b.containerRequests.length > 1 || b.containerRequests.some((item) => item.remark) ? (
        <section className="rounded border border-border bg-surface p-5">
          <h2 className="font-semibold">箱量需求</h2>
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[520px] text-left text-sm">
              <thead className="border-b border-border bg-sidebar text-xs text-muted">
                <tr>
                  <th className="px-3 py-2">箱型</th>
                  <th className="px-3 py-2">数量</th>
                  <th className="px-3 py-2">单柜重量</th>
                  <th className="px-3 py-2">备注</th>
                </tr>
              </thead>
              <tbody>
                {b.containerRequests.map((c) => (
                  <tr className="border-b border-border last:border-b-0" key={c.id}>
                    <td className="px-3 py-2 font-semibold">{c.containerType}</td>
                    <td className="px-3 py-2">{c.quantity}</td>
                    <td className="px-3 py-2">
                      {c.weightPerContainer ? `${c.weightPerContainer} KG/柜` : '—'}
                    </td>
                    <td className="px-3 py-2">{c.remark ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}
      <section className="rounded border border-border bg-surface p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="font-semibold">来源报价 Snapshot</h2>
            <p className="mt-1 text-sm text-muted">用于核对客户已接受的核心商务条件。</p>
          </div>
          {b.quoteId ? (
            <Link
              className="text-sm font-semibold text-primary hover:underline"
              href={`/admin/quotes/${b.quoteId}`}
            >
              {b.quote?.quoteNo ?? '查看报价'} →
            </Link>
          ) : null}
        </div>
        <dl className="mt-4 grid gap-4 text-sm sm:grid-cols-4">
          <Fact
            label="航线"
            value={`${route.polName} ${b.polCode} → ${route.podName} ${b.podCode}`}
          />
          <Fact label="船司" value={b.quote?.carrierCode ?? '—'} />
          <Fact label="航线服务" value={b.quote?.sourceRate?.serviceName ?? '—'} />
          <Fact label="预计开船时间" value={formatDate(b.quote?.etd ?? null)} />
          <Fact label="箱型 / 箱量" value={quoteContainerSummary} />
          <Fact label="金额" value={b.quote ? quoteAmounts(b.quote) : '—'} />
        </dl>
      </section>
      <section className="rounded border border-border bg-surface p-5">
        <h2 className="font-semibold">审核与执行记录</h2>
        <div className="mt-4 space-y-3 text-sm">
          {b.reviewActions.map((action) => (
            <div
              className="grid grid-cols-[132px_1fr] gap-3 rounded border border-border bg-sidebar px-3 py-2"
              key={action.id}
            >
              <div className="text-muted">{new Date(action.createdAt).toLocaleString('zh-CN')}</div>
              <div>
                <div className="font-semibold">
                  {reviewActionLabel(action.action)} · {action.actor?.displayName ?? '系统'}
                </div>
                {action.reasonCode ? (
                  <div className="mt-1">原因：{revisionReasonLabel(action.reasonCode)}</div>
                ) : null}
                {action.customerVisibleRemark ? (
                  <div className="mt-1">客户说明：{action.customerVisibleRemark}</div>
                ) : null}
                {action.internalRemark ? (
                  <div className="mt-1">内部备注：{action.internalRemark}</div>
                ) : null}
                {action.carrierSourceName || action.carrierReference ? (
                  <div className="mt-1">
                    订舱对象：{action.carrierSourceName ?? '—'} · 参考号：
                    {action.carrierReference ?? '—'}
                  </div>
                ) : null}
              </div>
            </div>
          ))}
          {soRecords.map((record) => (
            <div
              className="grid grid-cols-[132px_1fr] gap-3 rounded border border-border bg-sidebar px-3 py-2"
              key={`so-register-${record.id}`}
            >
              <div className="text-muted">{formatDateTime(record.createdAt)}</div>
              <div>
                <div className="font-semibold">
                  登记订舱确认单· {record.uploadedBy?.displayName ?? '系统'}
                </div>
                <div className="mt-1">
                  订舱确认单：{record.soNumber} · 文件：{record.document.originalFilename}
                </div>
                <div className="mt-1">
                  船司：{record.carrierCode ?? b.carrierCode ?? '—'} · 订舱对象：
                  {record.sourceName ?? '—'}
                </div>
              </div>
            </div>
          ))}
          {soRecords
            .filter((record) => record.publishedAt)
            .map((record) => (
              <div
                className="grid grid-cols-[132px_1fr] gap-3 rounded border border-border bg-sidebar px-3 py-2"
                key={`so-publish-${record.id}`}
              >
                <div className="text-muted">{formatDateTime(record.publishedAt)}</div>
                <div>
                  <div className="font-semibold">
                    订舱确认单发布给客户 · {record.publishedBy?.displayName ?? '系统'}
                  </div>
                  <div className="mt-1">订舱确认单：{record.soNumber} · 客户可见</div>
                </div>
              </div>
            ))}
          {!b.reviewActions.length && !soRecords.length ? (
            <div className="text-muted">暂无业务处理记录</div>
          ) : null}
        </div>
      </section>
      {['APPROVED', 'BOOKING_SUBMITTED', 'BOOKED'].includes(b.status) ? (
        <section className="rounded border border-border bg-surface p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="font-semibold">
                {b.status === 'BOOKED' ? '订舱结果 /订舱确认单' : '订舱执行'}
              </h2>
              <p className="mt-1 text-sm text-muted">
                {b.status === 'APPROVED'
                  ? '客户资料已通过审核，下一步是向承运船司或订舱对象提交订舱。'
                  : b.status === 'BOOKING_SUBMITTED'
                    ? '订舱已提交，当前等待船司或代理回复订舱确认单。'
                    : '订舱确认单已登记在内部系统，客户可见性由发布动作单独控制。'}
              </p>
            </div>
            {canUploadDocuments && b.status === 'BOOKING_SUBMITTED' ? (
              <button
                className={primary}
                disabled={busy}
                onClick={openRegisterSoDialog}
                type="button"
              >
                登记订舱确认单
              </button>
            ) : null}
          </div>
          {b.status === 'APPROVED' ? (
            <dl className="mt-4 grid gap-4 rounded border border-border bg-sidebar p-4 text-sm sm:grid-cols-3">
              <Fact label="当前状态" value="待提交订舱" />
              <Fact label="承运船司" value={b.carrierCode ?? '—'} />
              <Fact label="来源报价" value={b.quote?.quoteNo ?? '—'} />
            </dl>
          ) : null}
          {b.status === 'BOOKING_SUBMITTED' ? (
            <dl className="mt-4 grid gap-4 rounded border border-border bg-sidebar p-4 text-sm sm:grid-cols-3">
              <Fact label="当前状态" value="已提交订舱 · 待订舱确认单" />
              <Fact label="承运船司" value={b.carrierCode ?? '—'} />
              <Fact
                label="订舱对象"
                value={latestSubmission?.carrierSourceName ?? b.carrierCode ?? '—'}
              />
              <Fact label="订舱参考号" value={latestSubmission?.carrierReference ?? '—'} />
              <Fact label="提交时间" value={formatDateTime(latestSubmission?.createdAt ?? null)} />
              <Fact label="内部备注" value={latestSubmission?.internalRemark ?? '—'} />
            </dl>
          ) : null}
          {b.status === 'BOOKED' && currentSo ? (
            <div className="mt-4 rounded border border-border bg-sidebar p-4 text-sm">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <StatusBadge tone={currentSo.status === 'PUBLISHED' ? 'success' : 'warning'}>
                    {currentSo.status === 'PUBLISHED'
                      ? '订舱确认单已发布 · 客户可见'
                      : '订舱确认单已登记 · 客户暂不可见'}
                  </StatusBadge>
                  <div className="mt-3 text-lg font-semibold">{currentSo.soNumber}</div>
                </div>
                <div className="flex flex-wrap gap-2">
                  {canUploadDocuments && currentSo.status === 'PUBLISHED' ? (
                    <button
                      className={secondary}
                      disabled={busy}
                      onClick={() => {
                        openRegisterSoDialog();
                        setReplacingSoId(currentSo.id);
                        setSoNumber(currentSo.soNumber);
                        setSoSourceName(currentSo.sourceName ?? String());
                        setSoSourceType(currentSo.sourceType);
                        setSoVessel(currentSo.vessel ?? String());
                        setSoVoyage(currentSo.voyage ?? String());
                        setSoEtd(confirmationTimeInput(currentSo.etd));
                        setSoDetails({
                          carrierCode: currentSo.carrierCode ?? String(),
                          terminal: currentSo.terminal ?? String(),
                          eta: confirmationTimeInput(currentSo.eta),
                          cyCutoffAt: confirmationTimeInput(currentSo.cyCutoffAt),
                          siCutoffAt: confirmationTimeInput(currentSo.siCutoffAt),
                          vgmCutoffAt: confirmationTimeInput(currentSo.vgmCutoffAt),
                          receivedAt: String(),
                        });
                      }}
                      type="button"
                    >
                      修订订舱确认单
                    </button>
                  ) : null}
                  <button
                    className={secondary}
                    disabled={busy}
                    onClick={() => void downloadDocument(currentSo.document)}
                    type="button"
                  >
                    查看订舱确认单
                  </button>
                  {canManageDocuments && currentSo.status === 'INTERNAL_DRAFT' ? (
                    <button
                      className={secondary}
                      disabled={busy}
                      onClick={() => {
                        setPublishingSoId(currentSo.id);
                        setDialog('publish-so');
                      }}
                      type="button"
                    >
                      发布给客户
                    </button>
                  ) : null}
                  {canCreateShipment &&
                  ['INTERNAL_DRAFT', 'PUBLISHED'].includes(currentSo.status) &&
                  !b.shipments.length ? (
                    <button
                      className={`${primary} inline-flex items-center gap-2`}
                      disabled={busy}
                      onClick={() => setDialog('create-shipment')}
                      type="button"
                    >
                      <Ship className="h-4 w-4" aria-hidden="true" />
                      创建出运记录
                    </button>
                  ) : null}
                </div>
              </div>
              <dl className="mt-4 grid gap-4 sm:grid-cols-3">
                <Fact label="船司" value={currentSo.carrierCode ?? '待船司确认'} />
                <Fact label="订舱对象" value={currentSo.sourceName ?? '—'} />
                <Fact label="订舱确认单来源" value={soSourceTypeLabel(currentSo.sourceType)} />
                <Fact
                  label="船名 / 航次"
                  value={`${currentSo.vessel ?? '—'} / ${currentSo.voyage ?? '—'}`}
                />
                <Fact label="确认预计开船时间" value={formatConfirmationTime(currentSo.etd)} />
                <Fact label="预计到港时间" value={formatConfirmationTime(currentSo.eta)} />
                <Fact label="集装箱进港截止" value={formatConfirmationTime(currentSo.cyCutoffAt)}>
                  <span>
                    {formatConfirmationTime(currentSo.cyCutoffAt)}
                    <br />
                    {cutoffHint(currentSo.cyCutoffAt)}
                  </span>
                </Fact>
                <Fact label="补料截止" value={formatConfirmationTime(currentSo.siCutoffAt)}>
                  <span>
                    {formatConfirmationTime(currentSo.siCutoffAt)}
                    <br />
                    {cutoffHint(currentSo.siCutoffAt)}
                  </span>
                </Fact>
                <Fact
                  label="核实总重申报截止"
                  value={formatConfirmationTime(currentSo.vgmCutoffAt)}
                >
                  <span>
                    {formatConfirmationTime(currentSo.vgmCutoffAt)}
                    <br />
                    {cutoffHint(currentSo.vgmCutoffAt)}
                  </span>
                </Fact>
                <Fact label="码头" value={currentSo.terminal ?? '未提供'} />
                <Fact label="实际接收时间" value={formatConfirmationTime(currentSo.receivedAt)} />
                <Fact label="订舱确认单文件" value={currentSo.document.originalFilename} />
                <Fact label="登记时间" value={formatDateTime(currentSo.createdAt)} />
                <Fact label="登记人" value={currentSo.uploadedBy?.displayName ?? '—'} />
                <Fact
                  label="发布时间"
                  value={
                    currentSo.publishedAt
                      ? `${formatDateTime(currentSo.publishedAt)} · ${currentSo.publishedBy?.displayName ?? '—'}`
                      : '尚未发布'
                  }
                />
              </dl>
            </div>
          ) : null}
          {b.status === 'BOOKED' && !currentSo ? (
            <div className="mt-4 rounded border border-warning/30 bg-warning/10 px-4 py-3 text-sm">
              当前状态为「已订舱」，但尚未加载到订舱确认单记录。请刷新后核对历史数据。
            </div>
          ) : null}
        </section>
      ) : null}
      <BookingCommission bookingId={id} internal revision={b.status} />
      {b.shipments.length ? (
        <section className="rounded border border-border bg-surface p-5">
          <h2 className="font-semibold">关联出运记录</h2>
          <div className="mt-3 space-y-2 text-sm">
            {b.shipments.map((shipment) => (
              <Link
                className="block rounded bg-sidebar px-3 py-2 text-primary hover:underline"
                href={`/admin/shipments/${shipment.id}`}
                key={shipment.id}
              >
                {shipment.shipmentNo} · {shipment.status}
              </Link>
            ))}
          </div>
          {hasPermission(user, 'shipment.manage')
            ? b.shipments.map((shipment) => (
                <ShipmentConfirmationDifference
                  key={shipment.id}
                  shipmentId={shipment.id}
                  confirmationId={currentSo?.id}
                />
              ))
            : null}
        </section>
      ) : null}
      {dialog && dialog !== 'register-so' ? (
        <ActionDialog
          busy={busy}
          carrierCode={b.carrierCode}
          mode={dialog}
          reasonCode={reasonCode}
          reference={reference}
          remark={remark}
          sourceName={sourceName}
          onClose={() => {
            setDialog(null);
            setPublishingSoId(null);
          }}
          onReasonCode={setReasonCode}
          onReference={setReference}
          onRemark={setRemark}
          onSourceName={setSourceName}
          onSubmit={() => {
            if (dialog === 'approve') void act('approve');
            if (dialog === 'revision')
              void act('request-revision', { reasonCode, customerVisibleRemark: remark });
            if (dialog === 'reject') void act('reject', { remark });
            if (dialog === 'carrier')
              void act('submit-to-carrier', {
                sourceName: sourceName.trim() || b.carrierCode || undefined,
                reference: reference || undefined,
                internalRemark: remark || undefined,
              });
            if (dialog === 'publish-so' && publishingSoId) void publishSo(publishingSoId);
            if (dialog === 'create-shipment') void createShipment();
          }}
          confirmationPreview={dialog === 'publish-so' ? currentSo : undefined}
          shipmentPreview={
            currentSo
              ? {
                  bookingNo: b.bookingNo,
                  route: `${b.polCode} → ${b.podCode}`,
                  carrier: currentSo.carrierCode ?? '待船司确认',
                  vesselVoyage: `${currentSo.vessel ?? '—'} / ${currentSo.voyage ?? '—'}`,
                  etd: currentSo.etd,
                  eta: currentSo.eta,
                }
              : undefined
          }
        />
      ) : null}
      {dialog === 'register-so' ? (
        <RegisterSoDialog
          busy={busy}
          carrierCode={b.carrierCode}
          sourceName={soSourceName}
          sourceType={soSourceType}
          soFile={soFile}
          soNumber={soNumber}
          vessel={soVessel}
          voyage={soVoyage}
          etd={soEtd}
          details={soDetails}
          offset={soOffset}
          onOffset={setSoOffset}
          onDetail={(key, value) => {
            setSoDetails((current) => ({ ...current, [key]: value }));
            setSoFieldErrors((current) => ({ ...current, [key]: undefined }));
          }}
          errors={soFieldErrors}
          onClose={() => {
            setSoFieldErrors({});
            setDialog(null);
          }}
          onFile={(value) => {
            setSoFile(value);
            setSoFieldErrors((current) => ({ ...current, file: undefined }));
          }}
          onSourceName={(value) => {
            setSoSourceName(value);
            setSoFieldErrors((current) => ({ ...current, sourceName: undefined }));
          }}
          onSourceType={(value) => {
            setSoSourceType(value);
            setSoFieldErrors((current) => ({ ...current, sourceType: undefined }));
          }}
          onSoNumber={(value) => {
            setSoNumber(value);
            setSoFieldErrors((current) => ({ ...current, soNumber: undefined }));
          }}
          onVessel={(value) => {
            setSoVessel(value);
            setSoFieldErrors((current) => ({ ...current, vessel: undefined }));
          }}
          onVoyage={(value) => {
            setSoVoyage(value);
            setSoFieldErrors((current) => ({ ...current, voyage: undefined }));
          }}
          onEtd={(value) => {
            setSoEtd(value);
            setSoFieldErrors((current) => ({ ...current, etd: undefined }));
          }}
          onSubmit={() => void uploadSo()}
        />
      ) : null}
    </div>
  );
}
function OperationNoticeBar({ notice }: { notice: OperationNotice }) {
  const success = notice.tone === 'success';
  const Icon = success ? CheckCircle2 : AlertTriangle;
  return (
    <section
      className={`rounded border px-4 py-3 ${
        success ? 'border-success/20 bg-success/5' : 'border-danger/20 bg-danger/5'
      }`}
      role={success ? 'status' : 'alert'}
    >
      <div className="flex items-start gap-3">
        <span
          className={`mt-0.5 grid size-9 shrink-0 place-items-center rounded ${
            success ? 'bg-success/10 text-success' : 'bg-danger/10 text-danger'
          }`}
        >
          <Icon aria-hidden className="size-5" />
        </span>
        <div>
          <div className="text-sm font-semibold">{notice.title}</div>
          <p className="mt-1 text-sm leading-6 text-muted">{notice.description}</p>
        </div>
      </div>
    </section>
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
function InfoPanel({
  title,
  meta,
  children,
}: {
  title: string;
  meta?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="overflow-hidden rounded border border-border bg-surface">
      <div className="flex items-center justify-between gap-3 border-b border-border bg-sidebar px-4 py-3">
        <h2 className="text-sm font-semibold">{title}</h2>
        {meta ? <span className="text-xs font-medium text-muted">{meta}</span> : null}
      </div>
      <div className="divide-y divide-border px-4 py-1">{children}</div>
    </section>
  );
}

function CompactFact({
  label,
  value,
  tone = 'default',
  wide,
}: {
  label: string;
  value: string;
  tone?: 'default' | 'warning';
  wide?: boolean;
}) {
  return (
    <div className={`grid gap-3 py-3 text-sm ${wide ? '' : 'sm:grid-cols-[96px_1fr]'}`}>
      <dt className="text-xs font-medium text-muted">{label}</dt>
      <dd
        className={`min-w-0 break-words font-semibold ${
          tone === 'warning' ? 'text-warning' : 'text-foreground'
        }`}
      >
        {value}
      </dd>
    </div>
  );
}

function ReviewIssues({ issues, status }: { issues: ReviewIssue[]; status: string }) {
  if (!issues.length) {
    return status === 'SUBMITTED' ? (
      <div className="rounded border border-success/20 bg-success/10 px-4 py-3 text-sm text-success">
        暂未发现阻止审核的问题
      </div>
    ) : null;
  }
  return (
    <section className="rounded border border-border bg-surface p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-semibold">审核异常</h2>
        <StatusBadge tone={issues.some((issue) => issue.blocking) ? 'danger' : 'warning'}>
          {issues.filter((issue) => issue.blocking).length} 项阻断
        </StatusBadge>
      </div>
      <div className="mt-4 space-y-3">
        {issues.map((issue) => (
          <div
            className={`rounded border px-3 py-2 text-sm ${
              issue.blocking
                ? 'border-danger/20 bg-danger/10 text-danger'
                : 'border-warning/30 bg-warning/10 text-warning'
            }`}
            key={`${issue.code}-${issue.field}`}
          >
            <div className="font-semibold">{issue.message}</div>
            {issue.code === 'CARGO_READY_AFTER_ETD' ? (
              <div className="mt-1 text-xs">
                预计货好日期：{issue.details?.cargoReadyDate ?? '—'}，预计开船时间：
                {issue.details?.etd ?? '—'}
                。当前货好时间无法满足计划船期，请确认新的船期或客户货好时间。
              </div>
            ) : (
              <div className="mt-1 text-xs">{reviewIssueAdvice(issue.code)}</div>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}

function ActionDialog(props: {
  busy: boolean;
  carrierCode: string | null;
  mode: 'approve' | 'revision' | 'reject' | 'carrier' | 'publish-so' | 'create-shipment';
  reasonCode: string;
  reference: string;
  remark: string;
  confirmationPreview?: SoRecord;
  shipmentPreview?: {
    bookingNo: string;
    route: string;
    carrier: string;
    vesselVoyage: string;
    etd: string | null;
    eta: string | null;
  };
  sourceName: string;
  onClose(): void;
  onReasonCode(value: string): void;
  onReference(value: string): void;
  onRemark(value: string): void;
  onSourceName(value: string): void;
  onSubmit(): void;
}) {
  const needsRemark = props.mode === 'revision' || props.mode === 'reject';
  const title =
    props.mode === 'approve'
      ? '确认审核通过'
      : props.mode === 'revision'
        ? '退回客户补充资料'
        : props.mode === 'reject'
          ? '确认业务拒绝'
          : props.mode === 'carrier'
            ? '提交订舱'
            : props.mode === 'publish-so'
              ? '确认发布订舱确认单'
              : '确认创建出运记录';
  const submitLabel =
    props.mode === 'approve'
      ? '确认通过'
      : props.mode === 'revision'
        ? '确认退回'
        : props.mode === 'reject'
          ? '确认业务拒绝'
          : props.mode === 'carrier'
            ? '确认已提交'
            : props.mode === 'publish-so'
              ? '确认发布'
              : '确认创建';
  return (
    <div
      aria-labelledby="booking-action-dialog-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/35 p-4"
      role="dialog"
      aria-modal="true"
    >
      <div className="w-full max-w-lg space-y-4 rounded border border-border bg-surface p-5 shadow-xl">
        <h2 className="font-semibold" id="booking-action-dialog-title">
          {title}
        </h2>
        {props.mode === 'approve' ? (
          <div className="rounded border border-success/20 bg-success/10 px-3 py-2 text-sm text-foreground">
            该订舱 将进入待订舱阶段。请确认客户提交的货物、发货人和联系人资料已经满足实际订舱要求。
          </div>
        ) : null}
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
                <option key={value} value={value}>
                  {revisionReasonLabel(value)}
                </option>
              ))}
            </select>
          </label>
        ) : null}
        {props.mode === 'publish-so' ? (
          <div className="rounded border border-warning/30 bg-warning/10 px-3 py-2 text-sm text-foreground">
            发布后客户将立即可以查看并下载此订舱确认单。请确认订舱确认单号、附件和客户可见内容已经核对无误。
          </div>
        ) : null}
        {props.mode === 'publish-so' && props.confirmationPreview ? (
          <dl className="grid gap-3 text-sm sm:grid-cols-2">
            <Fact
              label="订舱确认单编号 / 版本"
              value={
                props.confirmationPreview.soNumber + ' / V' + props.confirmationPreview.version
              }
            />
            <Fact label="附件" value={props.confirmationPreview.document.originalFilename} />
            <Fact
              label="船司 / 船名 / 航次"
              value={[
                props.confirmationPreview.carrierCode,
                props.confirmationPreview.vessel,
                props.confirmationPreview.voyage,
              ]
                .map((v) => v || '未提供')
                .join(' / ')}
            />
            <Fact label="码头" value={props.confirmationPreview.terminal ?? '未提供'} />
            {(['etd', 'eta', 'cyCutoffAt', 'siCutoffAt', 'vgmCutoffAt', 'receivedAt'] as const).map(
              (key, index) => (
                <Fact
                  key={key}
                  label={
                    [
                      '预计开船',
                      '预计到港',
                      '集装箱进港截止',
                      '补料截止',
                      '核实总重申报截止',
                      '实际接收',
                    ][index]!
                  }
                  value={formatConfirmationTime(props.confirmationPreview![key])}
                />
              ),
            )}
          </dl>
        ) : null}
        {props.mode === 'create-shipment' ? (
          <div className="space-y-3">
            <div className="rounded border border-warning/30 bg-warning/10 px-3 py-2 text-sm text-foreground">
              创建后客户将在出运列表看到该出运记录。请确认内部登记的订舱确认单
              已核对，船期信息可作为当前出运基础信息。订舱确认单是否发布只影响客户查看和下载
              订舱确认单，不影响出运建档。
            </div>
            {props.shipmentPreview ? (
              <dl className="grid gap-3 rounded border border-border bg-sidebar p-3 text-sm sm:grid-cols-2">
                <Fact label="订舱" value={props.shipmentPreview.bookingNo} />
                <Fact label="航线" value={props.shipmentPreview.route} />
                <Fact label="船司" value={props.shipmentPreview.carrier} />
                <Fact label="船名 / 航次" value={props.shipmentPreview.vesselVoyage} />
                <Fact
                  label="预计开船时间"
                  value={formatConfirmationTime(props.shipmentPreview.etd)}
                />
                <Fact
                  label="预计到港时间"
                  value={formatConfirmationTime(props.shipmentPreview.eta)}
                />
              </dl>
            ) : null}
          </div>
        ) : null}
        {props.mode === 'reject' ? (
          <div className="rounded border border-danger/20 bg-danger/10 px-3 py-2 text-sm text-danger">
            业务拒绝是终止性动作，请在下方写清无法承接的原因。
          </div>
        ) : null}
        {props.mode === 'carrier' ? (
          <div className="space-y-3">
            <div className="rounded border border-border bg-sidebar px-3 py-2 text-sm">
              <div className="text-xs text-muted">承运船司</div>
              <div className="mt-1 font-semibold">{props.carrierCode ?? '—'}</div>
              <div className="mt-1 text-xs text-muted">来自客户已接受报价，不可在此修改。</div>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block text-sm">
                <span className="mb-1 block font-medium">订舱对象</span>
                <input
                  className={input}
                  maxLength={200}
                  placeholder="默认使用承运船司"
                  value={props.sourceName}
                  onChange={(event) => props.onSourceName(event.target.value)}
                />
              </label>
              <label className="block text-sm">
                <span className="mb-1 block font-medium">订舱参考号（选填）</span>
                <input
                  className={input}
                  maxLength={200}
                  value={props.reference}
                  onChange={(event) => props.onReference(event.target.value)}
                />
              </label>
            </div>
          </div>
        ) : null}
        {['approve', 'publish-so', 'create-shipment'].includes(props.mode) ? null : (
          <label className="block text-sm">
            <span className="mb-1 block font-medium">
              {props.mode === 'carrier' ? (
                '内部备注（选填）'
              ) : props.mode === 'reject' ? (
                <FieldLabel label="拒绝原因" required />
              ) : (
                <FieldLabel label="补充说明" required />
              )}
            </span>
            <textarea
              className={`${input} min-h-24 py-2`}
              maxLength={1000}
              placeholder={
                props.mode === 'reject'
                  ? '例如：船期无法满足、舱位不可提供、业务条件不符合。'
                  : undefined
              }
              value={props.remark}
              onChange={(event) => props.onRemark(event.target.value)}
            />
          </label>
        )}
        <div className="flex justify-end gap-2">
          <button className={secondary} disabled={props.busy} onClick={() => props.onClose()}>
            取消
          </button>
          <button
            className={props.mode === 'reject' ? danger : primary}
            disabled={props.busy || (needsRemark && props.remark.trim().length < 3)}
            onClick={() => props.onSubmit()}
          >
            {props.busy ? '处理中…' : submitLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

function RegisterSoDialog(props: {
  busy: boolean;
  carrierCode: string | null;
  sourceName: string;
  sourceType: string;
  soFile: File | null;
  soNumber: string;
  vessel: string;
  voyage: string;
  etd: string;
  details: Record<'eta' | 'cyCutoffAt' | 'siCutoffAt' | 'vgmCutoffAt' | 'terminal' | 'receivedAt' | 'carrierCode', string>;
  offset: string;
  onOffset(value: string): void;
  onDetail(key: keyof typeof props.details, value: string): void;
  errors: SoFieldErrors;
  onClose(): void;
  onFile(value: File | null): void;
  onSourceName(value: string): void;
  onSourceType(value: string): void;
  onSoNumber(value: string): void;
  onVessel(value: string): void;
  onVoyage(value: string): void;
  onEtd(value: string): void;
  onSubmit(): void;
}) {
  return (
    <div
      aria-labelledby="register-so-dialog-title"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/35 p-4"
      role="dialog"
    >
      <div className="max-h-[90dvh] w-full max-w-2xl overflow-y-auto rounded border border-border bg-surface shadow-xl">
        <div className="border-b border-border px-5 py-4">
          <h2 className="font-semibold" id="register-so-dialog-title">
            登记订舱确认单
          </h2>
          <p className="mt-1 text-sm text-muted">
            保存后仅内部可见，客户需要等到单独发布后才能在 Portal 查看。
          </p>
        </div>
        <div className="grid gap-4 px-5 py-4 sm:grid-cols-2">
          <div className="rounded border border-border bg-sidebar px-3 py-2 text-sm">
            <div className="text-xs text-muted">承运船司</div>
            <input
              aria-label="确认承运船司"
              className={input}
              maxLength={20}
              value={props.details.carrierCode}
              onChange={(e) => props.onDetail('carrierCode', e.target.value)}
            />
          </div>
          <label className="block text-sm">
            <span className="mb-1 block font-medium">
              <FieldLabel label="订舱确认单编号" required />
            </span>
            <input
              className={inputClass(props.errors.soNumber)}
              maxLength={100}
              value={props.soNumber}
              onChange={(event) => props.onSoNumber(event.target.value)}
            />
            {props.errors.soNumber ? (
              <span className="mt-1 block text-xs text-danger">{props.errors.soNumber}</span>
            ) : null}
          </label>
          <label className="block text-sm">
            <span className="mb-1 block font-medium">订舱确认单来源</span>
            <select
              className={inputClass(props.errors.sourceType)}
              value={props.sourceType}
              onChange={(event) => props.onSourceType(event.target.value)}
            >
              <option value="CARRIER">船司</option>
              <option value="AGENT">代理</option>
              <option value="OTHER">其他</option>
            </select>
            {props.errors.sourceType ? (
              <span className="mt-1 block text-xs text-danger">{props.errors.sourceType}</span>
            ) : null}
          </label>
          <label className="block text-sm">
            <span className="mb-1 block font-medium">来源名称</span>
            <input
              className={inputClass(props.errors.sourceName)}
              maxLength={200}
              value={props.sourceName}
              onChange={(event) => props.onSourceName(event.target.value)}
            />
            {props.errors.sourceName ? (
              <span className="mt-1 block text-xs text-danger">{props.errors.sourceName}</span>
            ) : null}
          </label>
          <label className="block text-sm">
            <span className="mb-1 block font-medium">船名</span>
            <input
              className={inputClass(props.errors.vessel)}
              maxLength={100}
              value={props.vessel}
              onChange={(event) => props.onVessel(event.target.value)}
            />
            {props.errors.vessel ? (
              <span className="mt-1 block text-xs text-danger">{props.errors.vessel}</span>
            ) : null}
          </label>
          <label className="block text-sm">
            <span className="mb-1 block font-medium">航次</span>
            <input
              className={inputClass(props.errors.voyage)}
              maxLength={50}
              value={props.voyage}
              onChange={(event) => props.onVoyage(event.target.value)}
            />
            {props.errors.voyage ? (
              <span className="mt-1 block text-xs text-danger">{props.errors.voyage}</span>
            ) : null}
          </label>
          <label className="block text-sm">
            <span className="mb-1 block font-medium">确认 / 更新预计开船时间</span>
            <input
              className={inputClass(props.errors.etd)}
              type="datetime-local"
              value={props.etd}
              onChange={(event) => props.onEtd(event.target.value)}
            />
            {props.errors.etd ? (
              <span className="mt-1 block text-xs text-danger">{props.errors.etd}</span>
            ) : null}
          </label>
          <label className="block text-sm sm:col-span-2">
            输入时间使用的时区
            <select
              className={input}
              value={props.offset}
              onChange={(e) => props.onOffset(e.target.value)}
            >
              {[
                '+08:00',
                '+00:00',
                '+01:00',
                '+02:00',
                '+03:00',
                '+04:00',
                '+05:30',
                '+07:00',
                '+09:00',
                '+10:00',
                '+11:00',
                '+12:00',
                '-04:00',
                '-05:00',
                '-06:00',
                '-07:00',
                '-08:00',
              ].map((offset) => (
                <option key={offset} value={offset}>
                  {offset === '+08:00' ? '北京时间 ' : ''}UTC{offset}
                </option>
              ))}
            </select>
            <span className="text-xs text-muted">
              按原单日期核对时差（含夏令时）；保存后统一按北京时间显示。未知的可选时间留空。
            </span>
          </label>
          {(
            ['eta', 'cyCutoffAt', 'siCutoffAt', 'vgmCutoffAt', 'receivedAt', 'terminal'] as const
          ).map((key, index) => (
            <label className="block text-sm" key={key}>
              <span className="mb-1 block">
                <FieldLabel
                  label={
                    [
                      '预计到港时间',
                      '集装箱进港截止',
                      '补料截止',
                      '核实总重申报截止',
                      '实际接收时间',
                      '码头',
                    ][index]!
                  }
                  required={key === 'receivedAt'}
                />
              </span>
              <input
                className={inputClass(props.errors[key])}
                type={key === 'terminal' ? 'text' : 'datetime-local'}
                maxLength={key === 'terminal' ? 300 : undefined}
                value={props.details[key]}
                onChange={(e) => props.onDetail(key, e.target.value)}
              />
              {props.errors[key] ? (
                <span className="text-xs text-danger">{props.errors[key]}</span>
              ) : null}
            </label>
          ))}
          {props.etd &&
          [props.details.cyCutoffAt, props.details.siCutoffAt, props.details.vgmCutoffAt].some(
            (value) => value && value > props.etd,
          ) ? (
            <p role="status" className="text-sm text-warning sm:col-span-2">
              部分截止时间晚于预计开船时间，请核对原单；确认无误后仍可保存。
            </p>
          ) : null}
          <label className="block sm:col-span-2">
            <span className="mb-1 block text-sm font-medium">
              <FieldLabel label="订舱确认单文件" required />
            </span>
            <span
              className={`flex min-h-20 cursor-pointer flex-col items-center justify-center rounded border border-dashed bg-sidebar px-4 py-4 text-sm hover:border-primary ${
                props.errors.file ? 'border-danger ring-1 ring-danger/20' : 'border-border'
              }`}
            >
              <span className="font-semibold text-primary">选择文件</span>
              <span className="mt-1 text-xs text-muted">支持 PDF、PNG、JPG，最大 10 MB</span>
              <input
                accept="application/pdf,image/png,image/jpeg"
                className="sr-only"
                type="file"
                onChange={(event) => props.onFile(event.target.files?.[0] ?? null)}
              />
            </span>
            {props.soFile ? (
              <div className="mt-2 rounded border border-border px-3 py-2 text-sm">
                {props.soFile.name} · {formatFileSize(props.soFile.size)}
              </div>
            ) : null}
            {props.errors.file ? (
              <span className="mt-1 block text-xs text-danger">{props.errors.file}</span>
            ) : null}
          </label>
        </div>
        <div className="flex justify-end gap-2 border-t border-border px-5 py-4">
          <button className={secondary} disabled={props.busy} onClick={() => props.onClose()}>
            取消
          </button>
          <button
            className={primary}
            disabled={props.busy || !props.soFile || !props.soNumber.trim()}
            onClick={() => props.onSubmit()}
          >
            {props.busy ? '保存中…' : '保存订舱确认单'}
          </button>
        </div>
      </div>
    </div>
  );
}
const input = 'h-10 w-full rounded border border-border bg-surface px-3 text-sm';
const inputClass = (error?: string) =>
  `${input} ${error ? 'border-danger bg-danger/5 ring-1 ring-danger/20' : ''}`;
const primary =
  'h-9 rounded bg-primary px-4 text-sm font-semibold text-surface disabled:opacity-40';
const secondary = 'h-9 rounded border border-border px-4 text-sm font-semibold disabled:opacity-40';
const danger =
  'h-9 rounded border border-danger/30 px-4 text-sm font-semibold text-danger disabled:opacity-40';

function routeDisplay(booking: Booking) {
  return {
    polName: booking.quote?.sourceRate?.polName ?? booking.polCode,
    podName: booking.quote?.sourceRate?.podName ?? booking.podCode,
  };
}

function formatDate(value: string | null) {
  return value ? value.slice(0, 10) : '—';
}


function formatDateTime(value: string | null) {
  return value ? new Date(value).toLocaleString('zh-CN') : '—';
}

function formatFileSize(size: number) {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / 1024 / 1024).toFixed(1)} MB`;
}

function soSourceTypeLabel(value: string) {
  const labels: Record<string, string> = {
    CARRIER: '船司',
    AGENT: '代理',
    OTHER: '其他',
  };
  return labels[value] ?? value;
}



function formatPackage(booking: Booking) {
  if (!booking.packageType && !booking.packages) return '—';
  return `${booking.packageType ?? '—'} × ${booking.packages ?? '—'}`;
}

function formatContainerRequests(items: Booking['containerRequests']) {
  return items.map((item) => `${item.quantity} × ${item.containerType}`).join('、') || '—';
}

function formatQuoteContainers(items: NonNullable<Booking['quote']>['items']) {
  return items
    .filter((item) => item.containerType)
    .map((item) => `${Number(item.quantity)} × ${item.containerType}`)
    .join('、');
}

function reviewIssueAdvice(code: string) {
  const advice: Record<string, string> = {
    MISSING_BOOKING_CONTACT: '请退回客户补充订舱联系人姓名。',
    MISSING_CONTACT_CHANNEL: '请退回客户补充邮箱或电话，便于操作人员跟进异常。',
    INVALID_GROSS_WEIGHT: '请退回客户修正货物毛重。',
    BOOKING_QUOTE_MISMATCH: '请核对报价与订舱快照，不要静默修复历史数据。',
    DANGEROUS_GOODS_INCOMPLETE: '请退回客户补充危险品品名、UN No.、IMO Class 或 MSDS 资料状态。',
    DANGEROUS_GOODS_MANUAL_REVIEW: '继续前请人工确认危险品资料是否满足订舱要求。',
  };
  return advice[code] ?? '请处理该异常后继续审核。';
}

function reviewActionLabel(action: string) {
  const labels: Record<string, string> = {
    APPROVE: '审核通过',
    REQUEST_REVISION: '退回补充',
    REJECT: '业务拒绝',
    SUBMIT_TO_CARRIER: '已提交订舱',
    CANCEL: '取消订舱',
  };
  return labels[action] ?? action;
}

function revisionReasonLabel(reason: string) {
  const labels: Record<string, string> = {
    CARGO_INCOMPLETE: '货物信息不完整',
    SHIPPER_INCOMPLETE: '发货人信息不完整',
    CONTACT_INCOMPLETE: '联系人信息不完整',
    CARGO_READY_DATE_INVALID: '货好日期需确认',
    CARGO_CONTAINER_CONFLICT: '箱量 / 货物信息存在冲突',
    DANGEROUS_GOODS_INFO_REQUIRED: '危险品资料不完整',
    OTHER: '其他',
  };
  return labels[reason] ?? reason;
}

function formatActionError(payload: ApiErrorPayload) {
  const blockingIssues = payload.details?.reviewIssues?.filter((issue) => issue.blocking) ?? [];
  if (blockingIssues.length) {
    return `存在 ${blockingIssues.length} 项必须处理的问题，暂时无法审核通过。`;
  }
  if (payload.code === 'VALIDATION_ERROR') return '请检查弹窗中的字段后重新提交。';
  return payload.message ?? '操作失败。';
}

function mapSoFieldErrors(payload: ApiErrorPayload): SoFieldErrors {
  const fieldErrors = payload.details?.fieldErrors;
  if (!fieldErrors) return {};
  const labels: Record<string, [keyof SoFieldErrors, string]> = {
    file: ['file', '请选择 PDF、PNG 或 JPG 格式的订舱确认单文件。'],
    soNumber: ['soNumber', '请输入订舱确认单编号'],
    sourceType: ['sourceType', '请选择有效订舱确认单来源。'],
    sourceName: ['sourceName', '来源名称不能超过 200 个字符。'],
    carrierCode: ['carrierCode', '船司代码不能超过 20 个字符。'],
    vessel: ['vessel', '船名不能超过 100 个字符。'],
    voyage: ['voyage', '航次不能超过 50 个字符。'],
    etd: ['etd', '请输入有效预计开船时间。'],
    eta: ['eta', '预计到港时间无效。'],
    cyCutoffAt: ['cyCutoffAt', '集装箱进港截止时间无效。'],
    siCutoffAt: ['siCutoffAt', '补料截止时间无效。'],
    vgmCutoffAt: ['vgmCutoffAt', '核实总重申报截止时间无效。'],
    terminal: ['terminal', '码头最多 300 个字符。'],
    receivedAt: ['receivedAt', '订舱确认单接收时间无效，请重新提交。'],
  };
  return Object.keys(fieldErrors).reduce<SoFieldErrors>((result, field) => {
    const mapped = labels[field];
    if (mapped) result[mapped[0]] = mapped[1];
    return result;
  }, {});
}

function formatSoError(payload: ApiErrorPayload) {
  const messages: Record<string, string> = {
    SO_FILE_REQUIRED: '请选择订舱确认单文件后再保存。',
    SO_FILE_TYPE_INVALID: '订舱确认单文件仅支持 PDF、PNG 或 JPG。',
    VALIDATION_ERROR: '请检查弹窗中的字段后重新保存。',
    BOOKING_NOT_FOUND: '当前订舱状态不允许登记订舱确认单，请刷新后重试。',
  };
  return (payload.code && messages[payload.code]) || payload.message || '订舱确认单内部保存失败。';
}
