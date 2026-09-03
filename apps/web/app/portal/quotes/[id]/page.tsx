'use client';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Clock,
  FileCheck2,
  MapPin,
  Package,
  X,
} from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '@/components/auth-provider';
import { ErrorState } from '@/components/error-state';
import { LoadingState } from '@/components/loading-state';
import { PageHeader } from '@/components/page-header';
import { StatusBadge } from '@/components/status-badge';
import { hasPermission } from '@/lib/auth';
import { customerQuoteStatusLabel, quoteStatusTone } from '@/lib/quote-status';

interface Item {
  id: string;
  chargeCode: string;
  chargeName: string;
  chargeBasis: 'PER_CONTAINER' | 'PER_BL' | 'PER_SHIPMENT' | null;
  containerType: string | null;
  quantity: string;
  unitPrice: string;
  amount: string;
  currency: string;
}
interface Quote {
  quoteNo: string;
  status: string;
  polCode: string;
  podCode: string;
  carrierCode: string | null;
  etd: string | null;
  validUntil: string;
  currency: string;
  totalAmount: string;
  customerTerms: string | null;
  sentAt: string | null;
  version: number;
  items: Item[];
}
export default function QuoteDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { apiFetch, user } = useAuth();
  const canAcceptQuote = hasPermission(user, 'quote.accept');
  const canRejectQuote = hasPermission(user, 'quote.reject');
  const canCreateBooking = hasPermission(user, 'booking.create');
  const [quote, setQuote] = useState<Quote | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [actionError, setActionError] = useState('');
  const [submitting, setSubmitting] = useState<'accept' | 'reject' | null>(null);
  const [confirmingAccept, setConfirmingAccept] = useState(false);
  const [confirmingReject, setConfirmingReject] = useState(false);
  const [rejectReason, setRejectReason] = useState('');
  const [downloading, setDownloading] = useState(false);
  const [creatingBooking, setCreatingBooking] = useState(false);
  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const response = await apiFetch(`/api/v1/quotes/${encodeURIComponent(id)}`);
      const payload: unknown = await response.json();
      if (!response.ok) throw payload;
      setQuote(payload as Quote);
    } catch (caught) {
      setError((caught as { message?: string }).message ?? '报价详情加载失败。');
    } finally {
      setLoading(false);
    }
  }, [apiFetch, id]);
  useEffect(() => {
    void load();
  }, [load]);
  const decide = async (action: 'accept' | 'reject', reason?: string) => {
    setSubmitting(action);
    setActionError('');
    try {
      const response = await apiFetch(`/api/v1/quotes/${encodeURIComponent(id)}/${action}`, {
        method: 'POST',
        ...(reason
          ? {
              headers: { 'content-type': 'application/json' },
              body: JSON.stringify({ reason }),
            }
          : {}),
      });
      const payload: unknown = await response.json();
      if (!response.ok) throw payload;
      await load();
      return true;
    } catch (caught) {
      setActionError((caught as { message?: string }).message ?? '报价操作失败，请刷新后重试。');
      return false;
    } finally {
      setSubmitting(null);
    }
  };
  const confirmAccept = async () => {
    const accepted = await decide('accept');
    if (!accepted) return;
    setConfirmingAccept(false);
  };
  const confirmReject = async () => {
    const rejected = await decide('reject', rejectReason.trim() || undefined);
    if (!rejected) return;
    setConfirmingReject(false);
    setRejectReason('');
  };
  const downloadPdf = async () => {
    setDownloading(true);
    setActionError('');
    try {
      const response = await apiFetch(`/api/v1/quotes/${encodeURIComponent(id)}/pdf`);
      if (!response.ok) throw await response.json();
      const url = URL.createObjectURL(await response.blob());
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `${quote?.quoteNo ?? 'quote'}.pdf`;
      anchor.click();
      URL.revokeObjectURL(url);
    } catch (caught) {
      setActionError((caught as { message?: string }).message ?? 'PDF 下载失败。');
    } finally {
      setDownloading(false);
    }
  };
  const createBooking = async () => {
    setCreatingBooking(true);
    setActionError('');
    try {
      const response = await apiFetch('/api/v1/bookings', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ quoteId: id }),
      });
      const payload = (await response.json()) as { id?: string; message?: string };
      if (!response.ok || !payload.id) throw new Error(payload.message ?? '创建订舱失败。');
      router.push(`/portal/bookings/${payload.id}`);
    } catch (caught) {
      setActionError((caught as { message?: string }).message ?? '创建订舱失败。');
      setCreatingBooking(false);
    }
  };
  if (loading) return <LoadingState rows={6} />;
  if (error || !quote)
    return <ErrorState description={error || '报价不存在'} onRetry={() => void load()} />;
  const containerSummary = summarizeContainers(quote.items);
  return (
    <div className="space-y-5">
      <Link className="text-sm text-primary hover:underline" href="/portal/quotes">
        ← 返回报价列表
      </Link>
      <PageHeader
        actions={
          <div className="flex gap-2">
            {quote.status !== 'DRAFT' ? (
              <button
                className="h-9 rounded border border-border px-4 text-sm font-semibold disabled:opacity-40"
                disabled={downloading}
                onClick={() => void downloadPdf()}
                type="button"
              >
                {downloading ? '生成中…' : '下载 PDF'}
              </button>
            ) : null}
            {canRejectQuote && ['SENT', 'VIEWED'].includes(quote.status) ? (
              <button
                className="h-9 rounded border border-danger/30 px-4 text-sm font-semibold text-danger disabled:opacity-40"
                disabled={submitting !== null}
                onClick={() => setConfirmingReject(true)}
                type="button"
              >
                {submitting === 'reject' ? '处理中…' : '拒绝报价'}
              </button>
            ) : null}
            {canAcceptQuote && ['SENT', 'VIEWED'].includes(quote.status) ? (
              <button
                className="h-9 rounded bg-primary px-4 text-sm font-semibold text-surface disabled:opacity-40"
                disabled={submitting !== null}
                onClick={() => setConfirmingAccept(true)}
                type="button"
              >
                {submitting === 'accept' ? '处理中…' : '接受报价'}
              </button>
            ) : null}
            {canCreateBooking && quote.status === 'ACCEPTED' ? (
              <button
                className="h-9 rounded bg-primary px-4 text-sm font-semibold text-surface disabled:opacity-40"
                disabled={creatingBooking}
                onClick={() => void createBooking()}
                type="button"
              >
                {creatingBooking ? '创建中…' : '创建订舱'}
              </button>
            ) : null}
          </div>
        }
        eyebrow={`报价 V${quote.version}`}
        title={quote.quoteNo}
      />
      <QuoteDecisionStatus quote={quote} />
      <RouteSummary podCode={quote.podCode} polCode={quote.polCode} quoteItems={quote.items} />
      {actionError ? (
        <div className="rounded border border-danger/20 bg-danger/10 px-4 py-3 text-sm text-danger">
          {actionError}
        </div>
      ) : null}
      {quote.status === 'DRAFT' ? (
        <div className="rounded border border-warning/25 bg-warning/10 px-4 py-3 text-sm text-foreground">
          报价申请已提交，正在等待销售确认。确认后，你可以下载 PDF、接受或拒绝报价。
        </div>
      ) : null}
      {quote.status === 'EXPIRED' ? (
        <div className="rounded border border-warning/25 bg-warning/10 px-4 py-3 text-sm text-warning">
          该报价已过有效期，不能接受或拒绝。
        </div>
      ) : null}
      <section className="grid gap-4 rounded border border-border bg-surface p-4 sm:grid-cols-2 lg:grid-cols-4">
        <Fact label="状态">
          <StatusBadge tone={quoteStatusTone(quote.status)}>
            {customerQuoteStatusLabel(quote.status)}
          </StatusBadge>
        </Fact>
        <Fact label="船司" value={quote.carrierCode ?? '—'} />
        <Fact label="ETD" value={quote.etd?.slice(0, 10) ?? '船期待确认'} />
        <Fact label="有效期至" value={quote.validUntil.slice(0, 10)} />
      </section>
      {quote.customerTerms?.trim() ? (
        <section className="rounded border border-border bg-surface p-4">
          <h2 className="text-sm font-semibold">报价条款</h2>
          <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-foreground">
            {quote.customerTerms}
          </p>
        </section>
      ) : null}
      <section className="overflow-hidden rounded border border-border bg-surface">
        <div className="border-b border-border px-4 py-3">
          <h2 className="text-sm font-semibold">报价明细</h2>
          <p className="mt-1 text-xs text-muted">
            价格已在生成时保存为快照，后续源运价修改不会影响本报价。
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[700px] text-left text-sm">
            <thead>
              <tr className="border-b border-border bg-sidebar text-xs text-muted">
                <th className={head}>费用</th>
                <th className={head}>计费方式</th>
                <th className={head}>计费数量</th>
                <th className={head}>单价</th>
                <th className={`${head} text-right`}>金额</th>
              </tr>
            </thead>
            <tbody>
              {quote.items.map((item) => (
                <tr className="border-b border-border" key={item.id}>
                  <td className={cell}>
                    <div className="font-medium">{item.chargeName}</div>
                    <div className="text-xs text-muted">{item.chargeCode}</div>
                  </td>
                  <td className={cell}>{chargeUnitLabel(item)}</td>
                  <td className={cell}>{Number(item.quantity).toFixed(2)}</td>
                  <td className={cell}>{money(item.unitPrice, item.currency)}</td>
                  <td className={`${cell} text-right font-semibold`}>
                    {money(item.amount, item.currency)}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="bg-sidebar">
                <td className="px-4 py-4 text-right font-semibold" colSpan={4}>
                  报价总额
                </td>
                <td className="px-4 py-4 text-right text-lg font-bold text-primary">
                  {money(quote.totalAmount, quote.currency)}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </section>
      {canAcceptQuote && confirmingAccept ? (
        <div
          aria-labelledby="accept-quote-title"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/35 p-4"
          role="dialog"
        >
          <div className="w-full max-w-lg overflow-hidden rounded border border-border bg-surface shadow-xl">
            <div className="flex items-start justify-between gap-4 border-b border-border px-5 py-4">
              <div className="flex items-start gap-3">
                <div className="mt-0.5 grid size-9 shrink-0 place-items-center rounded-full bg-success/10 text-success">
                  <CheckCircle2 aria-hidden className="size-5" />
                </div>
                <div>
                  <h2 className="text-base font-semibold" id="accept-quote-title">
                    确认接受报价
                  </h2>
                  <p className="mt-1 text-sm text-muted">
                    接受后将锁定本次报价决策，下一步可以基于该报价创建订舱。
                  </p>
                </div>
              </div>
              <button
                aria-label="关闭接受报价确认"
                className="grid size-8 shrink-0 place-items-center rounded border border-border text-muted hover:text-foreground disabled:opacity-40"
                disabled={submitting !== null}
                onClick={() => setConfirmingAccept(false)}
                type="button"
              >
                <X aria-hidden className="size-4" />
              </button>
            </div>
            <div className="space-y-4 px-5 py-4 text-sm">
              <div className="grid gap-3 rounded border border-success/15 bg-success/5 p-3 sm:grid-cols-2">
                <Fact label="报价编号" value={quote.quoteNo} />
                <Fact label="报价总额" value={money(quote.totalAmount, quote.currency)} />
                <Fact
                  label="航线"
                  value={`${portDisplayName(quote.polCode)} → ${portDisplayName(quote.podCode)}`}
                />
                <Fact label="有效期至" value={quote.validUntil.slice(0, 10)} />
                <Fact label="箱量" value={containerSummary} />
              </div>
              <p className="text-sm leading-6 text-foreground">
                请确认航线、箱量、有效期和总额无误。确认后，销售和操作团队会按已接受报价继续跟进订舱。
              </p>
            </div>
            <div className="flex justify-end gap-2 border-t border-border px-5 py-4">
              <button
                className="h-9 rounded border border-border px-4 text-sm font-semibold disabled:opacity-40"
                disabled={submitting !== null}
                onClick={() => setConfirmingAccept(false)}
                type="button"
              >
                取消
              </button>
              <button
                className="h-9 rounded bg-primary px-4 text-sm font-semibold text-surface disabled:opacity-40"
                disabled={submitting !== null}
                onClick={() => void confirmAccept()}
                type="button"
              >
                {submitting === 'accept' ? '处理中…' : '确认接受'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
      {canRejectQuote && confirmingReject ? (
        <div
          aria-labelledby="reject-quote-title"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/35 p-4"
          role="dialog"
        >
          <div className="w-full max-w-lg overflow-hidden rounded border border-border bg-surface shadow-xl">
            <div className="flex items-start justify-between gap-4 border-b border-border px-5 py-4">
              <div className="flex items-start gap-3">
                <div className="mt-0.5 grid size-9 shrink-0 place-items-center rounded-full bg-danger/10 text-danger">
                  <AlertTriangle aria-hidden className="size-5" />
                </div>
                <div>
                  <h2 className="text-base font-semibold" id="reject-quote-title">
                    确认拒绝报价
                  </h2>
                  <p className="mt-1 text-sm text-muted">
                    拒绝后该报价不能再接受。如仍需订舱，需要重新提交报价申请。
                  </p>
                </div>
              </div>
              <button
                aria-label="关闭拒绝报价确认"
                className="grid size-8 shrink-0 place-items-center rounded border border-border text-muted hover:text-foreground"
                disabled={submitting !== null}
                onClick={() => setConfirmingReject(false)}
                type="button"
              >
                <X aria-hidden className="size-4" />
              </button>
            </div>
            <div className="space-y-4 px-5 py-4 text-sm">
              <div className="grid gap-3 rounded border border-danger/15 bg-danger/5 p-3 sm:grid-cols-2">
                <Fact label="报价编号" value={quote.quoteNo} />
                <Fact label="报价总额" value={money(quote.totalAmount, quote.currency)} />
                <Fact
                  label="航线"
                  value={`${portDisplayName(quote.polCode)} → ${portDisplayName(quote.podCode)}`}
                />
                <Fact label="箱量" value={containerSummary} />
              </div>
              <label className="block">
                <span className="font-medium">拒绝原因</span>
                <textarea
                  className="mt-2 min-h-28 w-full rounded border border-border bg-surface p-3 text-sm outline-none focus:border-danger focus:ring-2 focus:ring-danger/15"
                  maxLength={500}
                  onChange={(event) => setRejectReason(event.target.value)}
                  placeholder="例如：价格高于预期、船期不合适、客户计划取消。"
                  value={rejectReason}
                />
                <span className="mt-1 block text-xs text-muted">
                  可选，填写后会帮助销售调整后续报价。最多 500 字。
                </span>
              </label>
            </div>
            <div className="flex justify-end gap-2 border-t border-border px-5 py-4">
              <button
                className="h-9 rounded border border-border px-4 text-sm font-semibold disabled:opacity-40"
                disabled={submitting !== null}
                onClick={() => setConfirmingReject(false)}
                type="button"
              >
                取消
              </button>
              <button
                className="h-9 rounded bg-danger px-4 text-sm font-semibold text-surface disabled:opacity-40"
                disabled={submitting !== null}
                onClick={() => void confirmReject()}
                type="button"
              >
                {submitting === 'reject' ? '提交中…' : '确认拒绝报价'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
function QuoteDecisionStatus({ quote }: { quote: Quote }) {
  const config = quoteDecisionStatusConfig(quote.status);
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
              <StatusBadge tone={quoteStatusTone(quote.status)}>
                {customerQuoteStatusLabel(quote.status)}
              </StatusBadge>
              <span className="text-sm font-semibold">{config.title}</span>
            </div>
            <p className="mt-1 text-sm leading-6 text-muted">{config.description}</p>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-sm sm:text-right">
          <Fact label="有效期至" value={quote.validUntil.slice(0, 10)} />
          <Fact label="报价总额" value={money(quote.totalAmount, quote.currency)} />
        </div>
      </div>
    </section>
  );
}
function quoteDecisionStatusConfig(status: string) {
  if (status === 'ACCEPTED')
    return {
      icon: CheckCircle2,
      title: '报价已接受，可以创建订舱',
      description: '这张报价已经完成客户确认，后续订舱会沿用当前报价快照。',
      panelClass: 'border-success/20 bg-success/5',
      iconClass: 'bg-success/10 text-success',
    };
  if (status === 'BOOKED')
    return {
      icon: FileCheck2,
      title: '报价已转订舱',
      description: '这张报价已经进入订舱流程，请到订舱页面继续查看后续进度。',
      panelClass: 'border-success/20 bg-success/5',
      iconClass: 'bg-success/10 text-success',
    };
  if (status === 'SENT' || status === 'VIEWED')
    return {
      icon: Clock,
      title: '等待你的确认',
      description: '请核对航线、箱量、有效期和报价总额。接受前会再次展示关键摘要供你确认。',
      panelClass: 'border-primary/20 bg-primary/5',
      iconClass: 'bg-primary/10 text-primary',
    };
  if (status === 'DRAFT')
    return {
      icon: Clock,
      title: '销售正在确认报价',
      description: '正式报价发送后，你可以下载 PDF，并选择接受或拒绝。',
      panelClass: 'border-warning/25 bg-warning/10',
      iconClass: 'bg-warning/10 text-warning',
    };
  if (status === 'EXPIRED')
    return {
      icon: AlertTriangle,
      title: '报价已过有效期',
      description: '该报价不能再接受或拒绝。如仍需订舱，请重新提交报价申请。',
      panelClass: 'border-warning/25 bg-warning/10',
      iconClass: 'bg-warning/10 text-warning',
    };
  if (status === 'REJECTED')
    return {
      icon: AlertTriangle,
      title: '报价已拒绝',
      description: '该报价不能再接受。如计划继续出运，请重新提交报价申请。',
      panelClass: 'border-danger/20 bg-danger/5',
      iconClass: 'bg-danger/10 text-danger',
    };
  return {
    icon: FileCheck2,
    title: '报价状态已更新',
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
      <div className="mt-1 text-sm font-semibold">{children ?? value}</div>
    </div>
  );
}
function RouteSummary({
  polCode,
  podCode,
  quoteItems,
}: {
  polCode: string;
  podCode: string;
  quoteItems: Item[];
}) {
  const containers = quoteContainers(quoteItems);

  return (
    <section className="overflow-hidden rounded border border-primary/15 bg-surface shadow-sm">
      <div className="grid gap-px bg-border lg:grid-cols-[1fr_auto_1fr_1.1fr]">
        <RouteEndpoint code={polCode} label="起运港" tone="origin" />
        <div className="hidden bg-primary/5 px-3 py-5 lg:grid lg:place-items-center">
          <div className="grid size-9 place-items-center rounded-full bg-surface text-primary shadow-sm">
            <ArrowRight aria-hidden className="size-5" />
          </div>
        </div>
        <RouteEndpoint code={podCode} label="目的港" tone="destination" />
        <div className="bg-accent/5 px-4 py-4">
          <div className="flex items-center gap-2 text-xs font-bold text-warning">
            <span className="grid size-7 place-items-center rounded bg-warning/10 text-warning">
              <Package aria-hidden className="size-4" />
            </span>
            箱量
          </div>
          <div className="mt-2 space-y-2">
            {containers.length ? (
              containers.map((item) => (
                <div key={item.containerType}>
                  <div className="text-xl font-bold text-warning">
                    {Number(item.quantity).toFixed(0)} 个 {item.containerType}
                  </div>
                  <div className="mt-0.5 text-sm text-muted">
                    {containerTypeLabel(item.containerType)}
                  </div>
                </div>
              ))
            ) : (
              <div className="text-xl font-bold text-foreground">待确认</div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
function RouteEndpoint({
  label,
  code,
  tone,
}: {
  label: string;
  code: string;
  tone: 'origin' | 'destination';
}) {
  const toneClass =
    tone === 'origin'
      ? {
          panel: 'bg-primary/5',
          icon: 'bg-primary/10 text-primary',
          label: 'text-primary',
          code: 'text-primary',
        }
      : {
          panel: 'bg-success/5',
          icon: 'bg-success/10 text-success',
          label: 'text-success',
          code: 'text-success',
        };
  return (
    <div className={`${toneClass.panel} px-4 py-4`}>
      <div className={`flex items-center gap-2 text-xs font-bold ${toneClass.label}`}>
        <span className={`grid size-7 place-items-center rounded ${toneClass.icon}`}>
          <MapPin aria-hidden className="size-4" />
        </span>
        {label}
      </div>
      <div className={`mt-2 text-2xl font-bold ${toneClass.code}`}>{code}</div>
      <div className="mt-0.5 text-sm text-muted">{portDisplayName(code)}</div>
    </div>
  );
}
const head = 'px-4 py-3 font-semibold';
const cell = 'px-4 py-3 align-middle';
function money(value: string, currency: string) {
  return `${currency} ${new Intl.NumberFormat('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(value))}`;
}
function chargeUnitLabel(item: Pick<Item, 'chargeBasis' | 'containerType'>) {
  if (item.chargeBasis === 'PER_BL') return '/B/L';
  if (item.chargeBasis === 'PER_SHIPMENT') return '/Shipment';
  return item.containerType
    ? `/${item.containerType} ${containerTypeLabel(item.containerType)}`
    : '/Container';
}
function summarizeContainers(items: Item[]) {
  const containers = quoteContainers(items);
  if (!containers.length) return '待确认';
  return containers
    .map(
      (item) =>
        `${Number(item.quantity).toFixed(0)} 个 ${item.containerType} ${containerTypeLabel(item.containerType)}`,
    )
    .join(' / ');
}
function quoteContainers(items: Item[]) {
  const pricedContainers = items.filter(
    (item) => item.chargeCode === 'OCEAN_FREIGHT' && item.containerType,
  );
  const source = pricedContainers.length
    ? pricedContainers
    : items.filter((item) => item.containerType);
  const byType = new Map<string, number>();
  for (const item of source) {
    if (!item.containerType) continue;
    const quantity = Number(item.quantity);
    const current = byType.get(item.containerType) ?? 0;
    byType.set(
      item.containerType,
      pricedContainers.length ? current + quantity : Math.max(current, quantity),
    );
  }
  return [...byType.entries()].map(([containerType, quantity]) => ({ containerType, quantity }));
}
function portDisplayName(code: string) {
  const names: Record<string, string> = {
    CNSHA: '上海港',
    CNSZX: '深圳港',
    CNNGB: '宁波舟山港',
    CNQIN: '青岛港',
    CNXMN: '厦门港',
    USLAX: '洛杉矶港',
    USLGB: '长滩港',
    USNYC: '纽约港',
    USSEA: '西雅图港',
  };
  return names[code] ?? '港口代码';
}
function containerTypeLabel(containerType: string | null) {
  const labels: Record<string, string> = {
    '20DC': '20 尺标准箱',
    '40DC': '40 尺标准箱',
    '40GP': '40 尺标准箱',
    '40HQ': '40 尺高柜',
    '45HQ': '45 尺高柜',
  };
  return containerType ? (labels[containerType] ?? '集装箱箱型') : '集装箱';
}
