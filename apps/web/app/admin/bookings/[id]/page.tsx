'use client';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '@/components/auth-provider';
import { ErrorState } from '@/components/error-state';
import { LoadingState } from '@/components/loading-state';
import { PageHeader } from '@/components/page-header';
import { StatusBadge } from '@/components/status-badge';
import { bookingStatusLabel, bookingStatusTone } from '@/lib/booking-status';
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
  customer: { name: string };
  quote: {
    quoteNo: string;
    polCode: string;
    podCode: string;
    carrierCode: string | null;
    etd: string | null;
    currency: string;
    totalAmount: string;
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
  document: { id: string; originalFilename: string; customerVisible: boolean };
}
export default function AdminBookingDetail() {
  const { id } = useParams<{ id: string }>();
  const { apiFetch, user } = useAuth();
  const [b, setB] = useState<Booking | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [dialog, setDialog] = useState<
    'approve' | 'revision' | 'reject' | 'carrier' | 'register-so' | 'publish-so' | null
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
      if (!soResponse.ok) throw new Error(soPayload.message ?? 'SO 记录加载失败。');
      setB(p);
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
      if (b?.carrierCode) form.append('carrierCode', b.carrierCode);
      if (soVessel.trim()) form.append('vessel', soVessel.trim());
      if (soVoyage.trim()) form.append('voyage', soVoyage.trim());
      if (soEtd) form.append('etd', new Date(`${soEtd}T00:00:00.000Z`).toISOString());
      const response = await apiFetch(`/api/v1/admin/bookings/${id}/so-records`, {
        method: 'POST',
        body: form,
      });
      const payload = (await response.json()) as { message?: string };
      if (!response.ok) throw new Error(payload.message ?? 'SO 内部保存失败。');
      setSoFile(null);
      setSoNumber('');
      setSoVessel('');
      setSoVoyage('');
      setSoEtd('');
      setDialog(null);
      await load();
    } catch (caught) {
      setError((caught as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const publishSo = async (soId: string) => {
    setBusy(true);
    setError('');
    try {
      const response = await apiFetch(`/api/v1/admin/bookings/${id}/so-records/${soId}/publish`, {
        method: 'POST',
      });
      const payload = (await response.json()) as { message?: string };
      if (!response.ok) throw new Error(payload.message ?? 'SO 发布失败。');
      setPublishingSoId(null);
      setDialog(null);
      await load();
    } catch (caught) {
      setError((caught as Error).message);
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
  const canManage = Boolean(
    user?.roles.some((role) => ['SUPER_ADMIN', 'TENANT_ADMIN', 'OPERATION'].includes(role)),
  );
  const reviewIssues = b.reviewIssues ?? [];
  const blockingIssues = reviewIssues.filter((issue) => issue.blocking);
  const route = routeDisplay(b);
  const quoteItems = b.quote?.items ?? [];
  const quoteContainerSummary = quoteItems.length ? formatQuoteContainers(quoteItems) : '—';
  const latestSubmission = b.reviewActions.find((action) => action.action === 'SUBMIT_TO_CARRIER');
  const currentSo =
    soRecords.find((record) => record.status === 'INTERNAL_DRAFT') ??
    soRecords.find((record) => record.status === 'PUBLISHED') ??
    soRecords[0];
  const openCarrierDialog = () => {
    setSourceName(latestSubmission?.carrierSourceName ?? b.carrierCode ?? '');
    setReference(latestSubmission?.carrierReference ?? '');
    setRemark('');
    setDialog('carrier');
  };
  const openRegisterSoDialog = () => {
    const provider = latestSubmission?.carrierSourceName ?? b.carrierCode ?? '';
    setSoNumber('');
    setSoFile(null);
    setSoSourceName(provider);
    setSoSourceType(provider && provider !== b.carrierCode ? 'AGENT' : 'CARRIER');
    setSoVessel('');
    setSoVoyage('');
    setSoEtd(formatDateInput(b.etd));
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
        description="Operation Booking Review"
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
      {error ? (
        <div className="rounded border border-danger/20 bg-danger/10 px-4 py-3 text-sm text-danger">
          {error}
        </div>
      ) : null}
      <section className="rounded border border-border bg-surface p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <StatusBadge tone={bookingStatusTone(b.status)}>{bookingStatusLabel(b.status)}</StatusBadge>
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
            <div className="mt-1 text-muted">Source Quote {b.quote?.quoteNo ?? '—'}</div>
          </div>
        </div>
        <dl className="mt-5 grid gap-4 border-t border-border pt-4 text-sm sm:grid-cols-5">
          <Fact label="Carrier" value={b.carrierCode ?? '—'} />
          <Fact label="Service" value={b.quote?.sourceRate?.serviceName ?? '—'} />
          <Fact label="ETD" value={formatDate(b.etd)} />
          <Fact label="Cargo Ready" value={formatDate(b.cargoReadyDate)} />
          <Fact label="Container" value={formatContainerRequests(b.containerRequests)} />
        </dl>
      </section>
      <ReviewIssues issues={reviewIssues} status={b.status} />
      <section className="grid items-start gap-4 lg:grid-cols-[1.15fr_0.95fr_1fr]">
        <InfoPanel title="货物信息 Cargo" meta={b.isDangerousGoods ? '危险品' : '普货'}>
          <CompactFact label="品名" value={b.commodity ?? '—'} />
          <CompactFact label="包装" value={formatPackage(b)} />
          <CompactFact label="毛重" value={b.grossWeight ? `${b.grossWeight} KG` : '—'} />
          <CompactFact label="体积" value={b.volumeCbm ? `${b.volumeCbm} CBM` : '—'} />
          <CompactFact label="货好日期" value={formatDate(b.cargoReadyDate)} />
          <CompactFact
            label="危险品"
            value={b.isDangerousGoods ? '是，需要资料核对' : '否'}
            tone={b.isDangerousGoods ? 'warning' : 'default'}
          />
          {b.specialInstructions ? (
            <CompactFact label="特殊要求" value={b.specialInstructions} wide />
          ) : null}
        </InfoPanel>
        <InfoPanel title="发货人 Shipper">
          <CompactFact label="Company" value={b.shipperName ?? '—'} />
          <CompactFact label="Address" value={b.shipperAddress ?? '—'} wide />
        </InfoPanel>
        <InfoPanel
          title="订舱联系人 Booking Contact"
          meta={b.bookingContactEmail || b.bookingContactPhone ? '可联系' : '缺少联系方式'}
        >
          <CompactFact label="Name" value={b.bookingContactName ?? '—'} />
          {b.bookingContactEmail ? <CompactFact label="Email" value={b.bookingContactEmail} /> : null}
          {b.bookingContactPhone ? <CompactFact label="Phone" value={b.bookingContactPhone} /> : null}
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
            <Link className="text-sm font-semibold text-primary hover:underline" href={`/admin/quotes/${b.quoteId}`}>
              {b.quote?.quoteNo ?? '查看报价'} →
            </Link>
          ) : null}
        </div>
        <dl className="mt-4 grid gap-4 text-sm sm:grid-cols-4">
          <Fact label="Route" value={`${route.polName} ${b.polCode} → ${route.podName} ${b.podCode}`} />
          <Fact label="Carrier" value={b.quote?.carrierCode ?? '—'} />
          <Fact label="Service" value={b.quote?.sourceRate?.serviceName ?? '—'} />
          <Fact label="ETD" value={formatDate(b.quote?.etd ?? null)} />
          <Fact label="Container" value={quoteContainerSummary} />
          <Fact label="Amount" value={b.quote ? `${b.quote.currency} ${formatMoney(b.quote.totalAmount)}` : '—'} />
        </dl>
      </section>
      <section className="rounded border border-border bg-surface p-5">
        <h2 className="font-semibold">审核与执行记录</h2>
        <div className="mt-4 space-y-3 text-sm">
          {b.reviewActions.map((action) => (
            <div className="grid grid-cols-[132px_1fr] gap-3 rounded border border-border bg-sidebar px-3 py-2" key={action.id}>
              <div className="text-muted">{new Date(action.createdAt).toLocaleString('zh-CN')}</div>
              <div>
                <div className="font-semibold">
                  {reviewActionLabel(action.action)} · {action.actor?.displayName ?? '系统'}
                </div>
                {action.reasonCode ? <div className="mt-1">原因：{revisionReasonLabel(action.reasonCode)}</div> : null}
                {action.customerVisibleRemark ? (
                  <div className="mt-1">客户说明：{action.customerVisibleRemark}</div>
                ) : null}
                {action.internalRemark ? <div className="mt-1">内部备注：{action.internalRemark}</div> : null}
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
                  登记 SO · {record.uploadedBy?.displayName ?? '系统'}
                </div>
                <div className="mt-1">
                  SO：{record.soNumber} · 文件：{record.document.originalFilename}
                </div>
                <div className="mt-1">
                  Carrier：{record.carrierCode ?? b.carrierCode ?? '—'} · Booking Provider：
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
                    SO 发布给客户 · {record.publishedBy?.displayName ?? '系统'}
                  </div>
                  <div className="mt-1">SO：{record.soNumber} · 客户可见</div>
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
                {b.status === 'BOOKED' ? '订舱结果 / SO' : '订舱执行'}
              </h2>
              <p className="mt-1 text-sm text-muted">
                {b.status === 'APPROVED'
                  ? '客户资料已通过审核，下一步是向承运船司或订舱对象提交订舱。'
                  : b.status === 'BOOKING_SUBMITTED'
                    ? '订舱已提交，当前等待船司或 Agent 回复 SO。'
                    : 'SO 已登记在内部系统，客户可见性由发布动作单独控制。'}
              </p>
            </div>
            {canManage && b.status === 'BOOKING_SUBMITTED' ? (
              <button className={primary} disabled={busy} onClick={openRegisterSoDialog} type="button">
                登记 SO
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
              <Fact label="当前状态" value="已提交订舱 · 待 SO" />
              <Fact label="承运船司" value={b.carrierCode ?? '—'} />
              <Fact label="订舱对象" value={latestSubmission?.carrierSourceName ?? b.carrierCode ?? '—'} />
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
                    {currentSo.status === 'PUBLISHED' ? 'SO 已发布 · 客户可见' : 'SO 已登记 · 客户暂不可见'}
                  </StatusBadge>
                  <div className="mt-3 text-lg font-semibold">{currentSo.soNumber}</div>
                </div>
                <div className="flex gap-2">
                  <button
                    className={secondary}
                    disabled={busy}
                    onClick={() => void downloadDocument(currentSo.document)}
                    type="button"
                  >
                    查看 SO
                  </button>
                  {canManage && currentSo.status === 'INTERNAL_DRAFT' ? (
                    <button
                      className={primary}
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
                </div>
              </div>
              <dl className="mt-4 grid gap-4 sm:grid-cols-3">
                <Fact label="Carrier" value={currentSo.carrierCode ?? b.carrierCode ?? '—'} />
                <Fact label="Booking Provider" value={currentSo.sourceName ?? '—'} />
                <Fact label="SO 来源" value={soSourceTypeLabel(currentSo.sourceType)} />
                <Fact label="Vessel / Voyage" value={`${currentSo.vessel ?? '—'} / ${currentSo.voyage ?? '—'}`} />
                <Fact label="Confirmed ETD" value={formatDate(currentSo.etd)} />
                <Fact label="SO 文件" value={currentSo.document.originalFilename} />
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
              当前 Booking 已进入 BOOKED，但尚未加载到 SO 记录。请刷新后核对历史数据。
            </div>
          ) : null}
        </section>
      ) : null}
      {b.shipments.length ? (
        <section className="rounded border border-border bg-surface p-5">
          <h2 className="font-semibold">关联 Shipment</h2>
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
          }}
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
          onClose={() => setDialog(null)}
          onFile={setSoFile}
          onSourceName={setSoSourceName}
          onSourceType={setSoSourceType}
          onSoNumber={setSoNumber}
          onVessel={setSoVessel}
          onVoyage={setSoVoyage}
          onEtd={setSoEtd}
          onSubmit={() => void uploadSo()}
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
                Cargo Ready Date：{issue.details?.cargoReadyDate ?? '—'}，ETD：
                {issue.details?.etd ?? '—'}。当前货好时间无法满足计划船期，请确认新的船期或客户货好时间。
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
  mode: 'approve' | 'revision' | 'reject' | 'carrier' | 'publish-so';
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
          : '确认发布 SO';
  const submitLabel =
    props.mode === 'approve'
      ? '确认通过'
      : props.mode === 'revision'
        ? '确认退回'
        : props.mode === 'reject'
          ? '确认业务拒绝'
          : props.mode === 'carrier'
            ? '确认已提交'
            : '确认发布';
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
            该 Booking 将进入待订舱阶段。请确认客户提交的货物、发货人和联系人资料已经满足实际订舱要求。
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
            发布后客户将立即可以查看并下载此 SO。请确认 SO 号、附件和客户可见内容已经核对无误。
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
        {props.mode === 'approve' || props.mode === 'publish-so' ? null : (
          <label className="block text-sm">
            <span className="mb-1 block font-medium">
              {props.mode === 'carrier'
                ? '内部备注（选填）'
                : props.mode === 'reject'
                  ? '拒绝原因 *'
                  : '补充说明 *'}
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
      <div className="w-full max-w-2xl rounded border border-border bg-surface shadow-xl">
        <div className="border-b border-border px-5 py-4">
          <h2 className="font-semibold" id="register-so-dialog-title">
            登记 SO
          </h2>
          <p className="mt-1 text-sm text-muted">
            保存后仅内部可见，客户需要等到单独发布后才能在 Portal 查看。
          </p>
        </div>
        <div className="grid gap-4 px-5 py-4 sm:grid-cols-2">
          <div className="rounded border border-border bg-sidebar px-3 py-2 text-sm">
            <div className="text-xs text-muted">承运船司</div>
            <div className="mt-1 font-semibold">{props.carrierCode ?? '—'}</div>
          </div>
          <label className="block text-sm">
            <span className="mb-1 block font-medium">SO No. *</span>
            <input
              className={input}
              maxLength={100}
              value={props.soNumber}
              onChange={(event) => props.onSoNumber(event.target.value)}
            />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block font-medium">SO 来源</span>
            <select
              className={input}
              value={props.sourceType}
              onChange={(event) => props.onSourceType(event.target.value)}
            >
              <option value="CARRIER">Carrier</option>
              <option value="AGENT">Agent</option>
              <option value="OTHER">其他</option>
            </select>
          </label>
          <label className="block text-sm">
            <span className="mb-1 block font-medium">来源名称</span>
            <input
              className={input}
              maxLength={200}
              value={props.sourceName}
              onChange={(event) => props.onSourceName(event.target.value)}
            />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block font-medium">Vessel</span>
            <input
              className={input}
              maxLength={100}
              value={props.vessel}
              onChange={(event) => props.onVessel(event.target.value)}
            />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block font-medium">Voyage</span>
            <input
              className={input}
              maxLength={50}
              value={props.voyage}
              onChange={(event) => props.onVoyage(event.target.value)}
            />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block font-medium">Confirmed / Updated ETD</span>
            <input
              className={input}
              type="date"
              value={props.etd}
              onChange={(event) => props.onEtd(event.target.value)}
            />
          </label>
          <label className="block sm:col-span-2">
            <span className="mb-1 block text-sm font-medium">SO 文件 *</span>
            <span className="flex min-h-20 cursor-pointer flex-col items-center justify-center rounded border border-dashed border-border bg-sidebar px-4 py-4 text-sm hover:border-primary">
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
            {props.busy ? '保存中…' : '保存 SO'}
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

function routeDisplay(booking: Booking) {
  return {
    polName: booking.quote?.sourceRate?.polName ?? booking.polCode,
    podName: booking.quote?.sourceRate?.podName ?? booking.podCode,
  };
}

function formatDate(value: string | null) {
  return value ? value.slice(0, 10) : '—';
}

function formatDateInput(value: string | null) {
  return value ? value.slice(0, 10) : '';
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
    CARRIER: 'Carrier',
    AGENT: 'Agent',
    OTHER: '其他',
  };
  return labels[value] ?? value;
}

function formatMoney(value: string) {
  return Number(value).toLocaleString('zh-CN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
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
    MISSING_CONTACT_CHANNEL: '请退回客户补充邮箱或电话，便于 Operation 跟进异常。',
    INVALID_GROSS_WEIGHT: '请退回客户修正货物毛重。',
    BOOKING_QUOTE_MISMATCH: '请核对 Quote 与 Booking 快照，不要静默修复历史数据。',
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

function formatActionError(payload: { details?: { reviewIssues?: ReviewIssue[] }; message?: string }) {
  const blockingIssues = payload.details?.reviewIssues?.filter((issue) => issue.blocking) ?? [];
  if (blockingIssues.length) {
    return `存在 ${blockingIssues.length} 项必须处理的问题，暂时无法审核通过。`;
  }
  return payload.message ?? '操作失败。';
}
