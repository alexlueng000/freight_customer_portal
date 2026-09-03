'use client';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { ArrowRight, CheckCircle2, FileSearch, MapPin, Package, TrendingUp, X } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '@/components/auth-provider';
import { ErrorState } from '@/components/error-state';
import { LoadingState } from '@/components/loading-state';
import { PageHeader } from '@/components/page-header';
import { FieldLabel } from '@/components/required-mark';
import { StatusBadge } from '@/components/status-badge';
import { quoteStatusLabel, quoteStatusTone } from '@/lib/quote-status';

interface Item {
  id: string;
  chargeCode: string;
  chargeName: string;
  chargeBasis: 'PER_CONTAINER' | 'PER_BL' | 'PER_SHIPMENT' | null;
  containerType: string | null;
  quantity: string;
  unitPrice: string;
  amount: string;
  costAmount: string | null;
  currency: string;
}
interface ApiErrorPayload {
  message?: string;
  details?: { fieldErrors?: Record<string, string[]> };
}
interface Quote {
  quoteNo: string;
  status: string;
  polCode: string;
  podCode: string;
  carrierCode: string | null;
  validUntil: string;
  currency: string;
  totalAmount: string;
  customerTerms: string | null;
  internalNote: string | null;
  sentAt: string | null;
  sentBy: { id: string; displayName: string; email: string } | null;
  customer: { name: string };
  sourceRate: {
    id: string;
    rateNo: string;
    serviceName: string | null;
    supplierName: string | null;
    contractNo: string | null;
    effectiveDate: string;
    expiryDate: string;
    transitDays: number | null;
  } | null;
  items: Item[];
}
export default function AdminQuoteDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { apiFetch } = useAuth();
  const [quote, setQuote] = useState<Quote | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [acting, setActing] = useState(false);
  const [editing, setEditing] = useState(false);
  const [confirmingSend, setConfirmingSend] = useState(false);
  const [reason, setReason] = useState('');
  const [prices, setPrices] = useState<Record<string, string>>({});
  const [reviewSaving, setReviewSaving] = useState(false);
  const [notice, setNotice] = useState<{ title: string; description: string } | null>(null);
  const [review, setReview] = useState({
    validUntil: '',
    customerTerms: '',
    internalNote: '',
  });
  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const response = await apiFetch(`/api/v1/admin/quotes/${encodeURIComponent(id)}`);
      const payload: unknown = await response.json();
      if (!response.ok) throw payload;
      const nextQuote = payload as Quote;
      setQuote(nextQuote);
      setReview({
        validUntil: nextQuote.validUntil.slice(0, 10),
        customerTerms: nextQuote.customerTerms ?? '',
        internalNote: nextQuote.internalNote ?? '',
      });
    } catch (caught) {
      setError(errorMessage(caught, '报价详情加载失败。'));
    } finally {
      setLoading(false);
    }
  }, [apiFetch, id]);
  useEffect(() => {
    void load();
  }, [load]);
  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(null), 3200);
    return () => window.clearTimeout(timer);
  }, [notice]);
  const act = async (action: 'send' | 'cancel') => {
    setActing(true);
    setError('');
    try {
      const response = await apiFetch(`/api/v1/admin/quotes/${encodeURIComponent(id)}/${action}`, {
        method: 'POST',
      });
      const payload: unknown = await response.json();
      if (!response.ok) throw payload;
      await load();
      return true;
    } catch (caught) {
      setError(errorMessage(caught, '报价操作失败。'));
      return false;
    } finally {
      setActing(false);
    }
  };
  const downloadPdf = async () => {
    setActing(true);
    setError('');
    try {
      const response = await apiFetch(`/api/v1/admin/quotes/${encodeURIComponent(id)}/pdf`);
      if (!response.ok) throw await response.json();
      const url = URL.createObjectURL(await response.blob());
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `${quote?.quoteNo ?? 'quote'}.pdf`;
      anchor.click();
      URL.revokeObjectURL(url);
    } catch (caught) {
      setError(errorMessage(caught, 'PDF 下载失败。'));
    } finally {
      setActing(false);
    }
  };
  const savePrices = async () => {
    if (!quote) return;
    setActing(true);
    setError('');
    try {
      const response = await apiFetch(`/api/v1/admin/quotes/${encodeURIComponent(id)}/prices`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          reason,
          items: quote.items.map((item) => ({
            itemId: item.id,
            unitPrice: prices[item.id] ?? item.unitPrice,
          })),
        }),
      });
      const payload: unknown = await response.json();
      if (!response.ok) throw payload;
      setEditing(false);
      setReason('');
      await load();
    } catch (caught) {
      setError(errorMessage(caught, '价格调整失败。'));
    } finally {
      setActing(false);
    }
  };
  const saveReview = async () => {
    if (!quote) return;
    setReviewSaving(true);
    setError('');
    setNotice(null);
    try {
      const response = await apiFetch(`/api/v1/admin/quotes/${encodeURIComponent(id)}/review`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(review),
      });
      const payload: unknown = await response.json();
      if (!response.ok) throw payload;
      await load();
      setNotice({
        title: '审核信息已保存。',
        description: '条款和内部备注已更新。',
      });
    } catch (caught) {
      setError(errorMessage(caught, '审核信息保存失败。'));
    } finally {
      setReviewSaving(false);
    }
  };
  const confirmSend = async () => {
    const sent = await act('send');
    if (!sent) return;
    setConfirmingSend(false);
    setNotice({
      title: '报价已发送客户。',
      description: '客户现在可以查看报价并下载正式 PDF。',
    });
  };
  if (loading) return <LoadingState rows={6} />;
  if (error && !quote) return <ErrorState description={error} onRetry={() => void load()} />;
  if (!quote) return null;
  const canCancel = ['DRAFT', 'SENT', 'VIEWED'].includes(quote.status);
  const showSentBanner = Boolean(
    quote.sentAt && ['SENT', 'VIEWED', 'ACCEPTED', 'BOOKED'].includes(quote.status),
  );
  const pricingSummary = summarizePricing(quote.items);
  const containerSummary = summarizeContainers(quote.items);
  return (
    <div className="space-y-5">
      <Link className="text-sm text-primary hover:underline" href="/admin/quotes">
        ← 返回报价列表
      </Link>
      {showSentBanner ? (
        <SentBanner
          customerName={quote.customer.name}
          sentAt={quote.sentAt}
          sentBy={quote.sentBy?.displayName ?? '当前销售'}
        />
      ) : null}
      <PageHeader
        eyebrow={quote.customer.name}
        title={quote.quoteNo}
        actions={
          <div className="flex gap-2">
            {quote.status === 'DRAFT' ? null : (
              <button
                className="h-9 rounded border border-border px-4 text-sm font-semibold disabled:opacity-40"
                disabled={acting}
                onClick={() => void downloadPdf()}
                type="button"
              >
                下载 PDF
              </button>
            )}
            {quote.status === 'DRAFT' ? (
              <button
                className="h-9 rounded border border-primary/30 px-4 text-sm font-semibold text-primary"
                onClick={() => {
                  setPrices(
                    Object.fromEntries(quote.items.map((item) => [item.id, item.unitPrice])),
                  );
                  setEditing(true);
                }}
                type="button"
              >
                调整价格
              </button>
            ) : null}
            {canCancel ? (
              <button
                className="h-9 rounded border border-warning/30 px-4 text-sm font-semibold text-warning disabled:opacity-40"
                disabled={acting}
                onClick={() => void act('cancel')}
                type="button"
              >
                作废
              </button>
            ) : null}
            {quote.status === 'DRAFT' ? (
              <button
                className="h-9 rounded bg-primary px-4 text-sm font-semibold text-surface disabled:opacity-40"
                disabled={acting}
                onClick={() => setConfirmingSend(true)}
                type="button"
              >
                确认并发送客户
              </button>
            ) : null}
          </div>
        }
      />
      <RouteSummary podCode={quote.podCode} polCode={quote.polCode} quoteItems={quote.items} />
      {error ? (
        <div className="rounded border border-danger/20 bg-danger/10 px-4 py-3 text-sm text-danger">
          {error}
        </div>
      ) : null}
      {notice ? (
        <div
          aria-live="polite"
          className="fixed right-5 top-5 z-50 flex w-[min(360px,calc(100vw-40px))] items-start gap-3 rounded border border-success/20 bg-surface px-4 py-3 text-sm text-foreground shadow-xl"
        >
          <CheckCircle2 aria-hidden className="mt-0.5 size-4 shrink-0 text-success" />
          <div className="min-w-0 flex-1">
            <div className="font-semibold">{notice.title}</div>
            <div className="mt-0.5 text-xs text-muted">{notice.description}</div>
          </div>
          <button
            aria-label="关闭提示"
            className="grid size-6 shrink-0 place-items-center rounded text-muted hover:bg-sidebar hover:text-foreground"
            onClick={() => setNotice(null)}
            type="button"
          >
            <X aria-hidden className="size-3.5" />
          </button>
        </div>
      ) : null}
      {editing ? (
        <section className="space-y-4 rounded border border-primary/20 bg-primary/5 p-4">
          <div>
            <h2 className="font-semibold">调整报价</h2>
            <p className="text-xs text-muted">仅草稿可调整；原价、修改价、原因和操作人会被保留。</p>
          </div>
          <div className="grid gap-3">
            {quote.items.map((item) => (
              <label
                className="grid gap-1 text-sm sm:grid-cols-[1fr_180px] sm:items-center"
                key={item.id}
              >
                <span>
                  {item.chargeName} {chargeUnitLabel(item)}
                </span>
                <input
                  className="h-9 rounded border border-border bg-surface px-3"
                  inputMode="decimal"
                  onChange={(event) =>
                    setPrices((value) => ({ ...value, [item.id]: event.target.value }))
                  }
                  value={prices[item.id] ?? item.unitPrice}
                />
              </label>
            ))}
          </div>
          <label className="block text-sm">
            <FieldLabel label="改价原因" required />
            <textarea
              className="mt-1 min-h-20 w-full rounded border border-border bg-surface p-3"
              maxLength={500}
              onChange={(event) => setReason(event.target.value)}
              value={reason}
            />
          </label>
          <div className="flex justify-end gap-2">
            <button
              className="h-9 rounded border border-border px-4 text-sm font-semibold"
              onClick={() => setEditing(false)}
              type="button"
            >
              取消
            </button>
            <button
              className="h-9 rounded bg-primary px-4 text-sm font-semibold text-surface disabled:opacity-40"
              disabled={acting || reason.trim().length < 3}
              onClick={() => void savePrices()}
              type="button"
            >
              保存改价
            </button>
          </div>
        </section>
      ) : null}
      <section className="grid gap-4 rounded border border-border bg-surface p-4 sm:grid-cols-4">
        <Fact label="状态">
          <StatusBadge tone={quoteStatusTone(quote.status)}>
            {quoteStatusLabel(quote.status)}
          </StatusBadge>
        </Fact>
        <Fact label="客户" value={quote.customer.name} />
        <Fact label="船司" value={quote.carrierCode ?? '—'} />
        <Fact label="有效期至" value={quote.validUntil.slice(0, 10)} />
      </section>
      <section className="rounded border border-border bg-surface">
        <div className="border-b border-border px-4 py-3">
          <h2 className="text-sm font-semibold">条款与内部信息</h2>
        </div>
        <div className="grid gap-4 p-4 lg:grid-cols-[220px_1fr_1fr]">
          <label className="block rounded border border-primary/10 bg-primary/5 p-3 text-sm">
            <span className="inline-flex rounded bg-primary/10 px-2 py-1 text-xs font-bold text-primary">
              有效期
            </span>
            <input
              className="mt-3 h-10 w-full rounded border border-primary/20 bg-surface px-3 text-sm disabled:bg-sidebar/50"
              disabled={quote.status !== 'DRAFT' || reviewSaving}
              max={quote.sourceRate?.expiryDate.slice(0, 10)}
              onChange={(event) =>
                setReview((value) => ({ ...value, validUntil: event.target.value }))
              }
              type="date"
              value={review.validUntil}
            />
            <span className="mt-1 block text-xs text-muted">
              不得超过 Rate Valid To {quote.sourceRate?.expiryDate.slice(0, 10) ?? '—'}
            </span>
          </label>
          <label className="block rounded border border-success/15 bg-success/5 p-3 text-sm">
            <span className="inline-flex rounded bg-success/10 px-2 py-1 text-xs font-bold text-success">
              客户可见报价条款
            </span>
            <textarea
              className="mt-3 min-h-28 w-full rounded border border-success/20 bg-surface p-3 text-sm disabled:bg-sidebar/50"
              disabled={quote.status !== 'DRAFT' || reviewSaving}
              maxLength={2000}
              onChange={(event) =>
                setReview((value) => ({ ...value, customerTerms: event.target.value }))
              }
              value={review.customerTerms}
            />
          </label>
          <label className="block rounded border border-warning/15 bg-warning/5 p-3 text-sm">
            <span className="inline-flex rounded bg-warning/10 px-2 py-1 text-xs font-bold text-warning">
              内部备注
            </span>
            <textarea
              className="mt-3 min-h-28 w-full rounded border border-warning/20 bg-surface p-3 text-sm disabled:bg-sidebar/50"
              disabled={quote.status !== 'DRAFT' || reviewSaving}
              maxLength={2000}
              onChange={(event) =>
                setReview((value) => ({ ...value, internalNote: event.target.value }))
              }
              value={review.internalNote}
            />
          </label>
        </div>
        {quote.status === 'DRAFT' ? (
          <div className="flex justify-end border-t border-border px-4 py-3">
            <button
              className="h-9 rounded bg-primary px-4 text-sm font-semibold text-surface disabled:opacity-40"
              disabled={reviewSaving}
              onClick={() => void saveReview()}
              type="button"
            >
              {reviewSaving ? '保存中…' : '保存审核信息'}
            </button>
          </div>
        ) : null}
      </section>
      <section className="overflow-hidden rounded border border-border bg-surface">
        <SectionHeader
          description="销售审核时用于追溯成本来源、合约和发送记录。"
          icon={<FileSearch aria-hidden className="size-4" />}
          title="Rate 来源与发送记录"
        />
        <div className="grid gap-px bg-border sm:grid-cols-2 xl:grid-cols-4">
          <SourceFact
            emphasis
            label="来源 Rate"
            value={quote.sourceRate?.rateNo ?? '—'}
          />
          <SourceFact label="Service" value={quote.sourceRate?.serviceName ?? '—'} />
          <SourceFact label="Supplier" value={quote.sourceRate?.supplierName ?? '—'} />
          <SourceFact label="Contract" value={quote.sourceRate?.contractNo ?? '—'} />
          <SourceFact
            label="Rate Valid From"
            value={quote.sourceRate?.effectiveDate.slice(0, 10) ?? '—'}
          />
          <SourceFact
            emphasis
            label="Rate Valid To"
            value={quote.sourceRate?.expiryDate.slice(0, 10) ?? '—'}
          />
          <SourceFact
            label="Transit Time"
            value={
              quote.sourceRate?.transitDays === null || quote.sourceRate?.transitDays === undefined
                ? '—'
                : `${quote.sourceRate.transitDays} 天`
            }
          />
          <SourceFact label="Quote Container" value={containerSummary} />
          <SourceFact label="Sent At" value={quote.sentAt?.slice(0, 16).replace('T', ' ') ?? '—'} />
          <SourceFact label="Sent By" value={quote.sentBy?.displayName ?? '—'} />
        </div>
      </section>
      <section className="overflow-hidden rounded border border-border bg-surface">
        <SectionHeader
          description="按币种分别汇总，避免不同币种利润被混在一起。"
          icon={<TrendingUp aria-hidden className="size-4" />}
          title="利润概览"
        />
        <div className="divide-y divide-border">
          {pricingSummary.map((summary) => (
            <PricingSummaryRow summary={summary} key={summary.currency} />
          ))}
        </div>
      </section>
      <section className="overflow-hidden rounded border border-border bg-surface">
        <table className="w-full min-w-[760px] text-left text-sm">
          <thead>
            <tr className="border-b border-border bg-sidebar text-xs text-muted">
              <th className={head}>费用</th>
              <th className={head}>计费方式</th>
              <th className={head}>计费数量</th>
              <th className={head}>成本快照</th>
              <th className={head}>销售单价</th>
              <th className={`${head} text-right`}>金额</th>
            </tr>
          </thead>
          <tbody>
            {quote.items.map((item) => (
              <tr className="border-b border-border" key={item.id}>
                <td className={cell}>{item.chargeName}</td>
                <td className={cell}>{chargeUnitLabel(item)}</td>
                <td className={cell}>{Number(item.quantity).toFixed(2)}</td>
                <td className={cell}>
                  {item.costAmount ? money(item.costAmount, item.currency) : '—'}
                </td>
                <td className={cell}>{money(item.unitPrice, item.currency)}</td>
                <td className={`${cell} text-right font-semibold`}>
                  {money(item.amount, item.currency)}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="bg-sidebar">
              <td className="px-4 py-4 text-right font-semibold" colSpan={5}>
                报价总额
              </td>
              <td className="px-4 py-4 text-right text-lg font-bold text-primary">
                {money(quote.totalAmount, quote.currency)}
              </td>
            </tr>
          </tfoot>
        </table>
      </section>
      {confirmingSend ? (
        <div
          aria-labelledby="send-quote-title"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/35 p-4"
          role="dialog"
        >
          <div className="w-full max-w-md rounded border border-border bg-surface shadow-xl">
            <div className="border-b border-border px-5 py-4">
              <h2 className="text-base font-semibold" id="send-quote-title">
                确认并发送客户
              </h2>
              <p className="mt-1 text-sm text-muted">
                发送后客户可下载 PDF、接受或拒绝报价。
              </p>
            </div>
            <div className="space-y-3 px-5 py-4 text-sm">
              <Fact label="报价编号" value={quote.quoteNo} />
              <Fact label="客户" value={quote.customer.name} />
              <Fact
                label="航线"
                value={`${portDisplayName(quote.polCode)} → ${portDisplayName(quote.podCode)}`}
              />
              <Fact label="箱量" value={containerSummary} />
              <Fact label="有效期至" value={review.validUntil || quote.validUntil.slice(0, 10)} />
              <Fact label="报价总额" value={money(quote.totalAmount, quote.currency)} />
            </div>
            <div className="flex justify-end gap-2 border-t border-border px-5 py-4">
              <button
                className="h-9 rounded border border-border px-4 text-sm font-semibold disabled:opacity-40"
                disabled={acting}
                onClick={() => setConfirmingSend(false)}
                type="button"
              >
                取消
              </button>
              <button
                className="h-9 rounded bg-primary px-4 text-sm font-semibold text-surface disabled:opacity-40"
                disabled={acting}
                onClick={() => void confirmSend()}
                type="button"
              >
                {acting ? '发送中…' : '确认发送'}
              </button>
            </div>
          </div>
        </div>
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
      <div className="mt-1 text-sm font-semibold">{children ?? value}</div>
    </div>
  );
}
function SentBanner({
  customerName,
  sentAt,
  sentBy,
}: {
  customerName: string;
  sentAt: string | null;
  sentBy: string;
}) {
  return (
    <section className="rounded border border-success/25 bg-success/10 px-4 py-3">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="flex items-start gap-3">
          <div className="mt-0.5 grid size-9 shrink-0 place-items-center rounded-full bg-success/15 text-success">
            <CheckCircle2 aria-hidden className="size-5" />
          </div>
          <div>
            <div className="text-sm font-bold text-success">已发送客户，正式报价 PDF 已开放</div>
            <p className="mt-1 text-sm text-foreground">
              {customerName} 现在可以在客户门户查看报价、下载 PDF，并选择接受或拒绝。
            </p>
          </div>
        </div>
        <div className="grid gap-1 rounded border border-success/20 bg-surface/80 px-3 py-2 text-xs text-muted sm:grid-cols-2 md:min-w-64">
          <span>发送人</span>
          <span className="font-semibold text-foreground sm:text-right">{sentBy}</span>
          <span>发送时间</span>
          <span className="font-semibold text-foreground sm:text-right">
            {sentAt ? formatDateTime(sentAt) : '刚刚'}
          </span>
        </div>
      </div>
    </section>
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
  const containers = quoteItems.filter(
    (item) =>
      (item.chargeCode === 'OCEAN_FREIGHT' || item.chargeBasis === null) && item.containerType,
  );

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
                <div key={item.id}>
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
function SectionHeader({
  title,
  description,
  icon,
}: {
  title: string;
  description: string;
  icon: React.ReactNode;
}) {
  return (
    <div className="flex items-start gap-3 border-b border-border px-4 py-3">
      <div className="mt-0.5 grid size-8 shrink-0 place-items-center rounded border border-primary/20 bg-primary/5 text-primary">
        {icon}
      </div>
      <div>
        <h2 className="text-sm font-semibold">{title}</h2>
        <p className="mt-1 text-xs text-muted">{description}</p>
      </div>
    </div>
  );
}
function SourceFact({
  label,
  value,
  emphasis = false,
}: {
  label: string;
  value: string;
  emphasis?: boolean;
}) {
  return (
    <div className="bg-surface px-4 py-3">
      <div className="text-xs text-muted">{label}</div>
      <div className={`mt-1 text-sm ${emphasis ? 'font-bold text-foreground' : 'font-semibold'}`}>
        {value}
      </div>
    </div>
  );
}
function PricingSummaryRow({
  summary,
}: {
  summary: { currency: string; cost: number; sell: number; profit: number };
}) {
  const margin = summary.sell > 0 ? `${((summary.profit / summary.sell) * 100).toFixed(2)}%` : '—';
  return (
    <div className="grid gap-4 px-4 py-4 lg:grid-cols-[120px_repeat(4,minmax(0,1fr))] lg:items-center">
      <div>
        <div className="text-xs text-muted">币种</div>
        <div className="mt-1 text-base font-bold text-primary">{summary.currency}</div>
      </div>
      <Metric label="总成本" value={money(String(summary.cost), summary.currency)} />
      <Metric label="报价总额" value={money(String(summary.sell), summary.currency)} />
      <Metric
        label="预计毛利"
        tone={summary.profit < 0 ? 'danger' : 'success'}
        value={money(String(summary.profit), summary.currency)}
      />
      <Metric label="毛利率" tone={summary.profit < 0 ? 'danger' : 'success'} value={margin} />
    </div>
  );
}
function Metric({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: 'success' | 'danger';
}) {
  const toneClass =
    tone === 'success' ? 'text-success' : tone === 'danger' ? 'text-danger' : 'text-foreground';
  return (
    <div>
      <div className="text-xs text-muted">{label}</div>
      <div className={`mt-1 text-lg font-bold ${toneClass}`}>{value}</div>
    </div>
  );
}
function money(value: string, currency: string) {
  return `${currency} ${new Intl.NumberFormat('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(value))}`;
}
function formatDateTime(value: string) {
  return new Intl.DateTimeFormat('zh-CN', { dateStyle: 'medium', timeStyle: 'short' }).format(
    new Date(value),
  );
}
function chargeUnitLabel(item: Pick<Item, 'chargeBasis' | 'containerType'>) {
  if (item.chargeBasis === 'PER_BL') return '/B/L';
  if (item.chargeBasis === 'PER_SHIPMENT') return '/Shipment';
  return item.containerType
    ? `/${item.containerType} ${containerTypeLabel(item.containerType)}`
    : '/Container';
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
function summarizeContainers(items: Item[]) {
  const containers = items.filter(
    (item) =>
      (item.chargeCode === 'OCEAN_FREIGHT' || item.chargeBasis === null) && item.containerType,
  );
  if (!containers.length) return '—';
  return containers
    .map((item) => `${Number(item.quantity).toFixed(0)} × ${item.containerType}`)
    .join(' / ');
}
function summarizePricing(items: Item[]) {
  const summaries = new Map<string, { currency: string; cost: number; sell: number; profit: number }>();
  for (const item of items) {
    const summary = summaries.get(item.currency) ?? {
      currency: item.currency,
      cost: 0,
      sell: 0,
      profit: 0,
    };
    const quantity = Number(item.quantity);
    const cost = item.costAmount === null ? 0 : Number(item.costAmount) * quantity;
    const sell = Number(item.amount);
    summary.cost += cost;
    summary.sell += sell;
    summary.profit += sell - cost;
    summaries.set(item.currency, summary);
  }
  return [...summaries.values()];
}
function errorMessage(error: unknown, fallback: string) {
  const payload = error as ApiErrorPayload;
  const fieldErrors = payload.details?.fieldErrors;
  const firstFieldError = fieldErrors ? Object.values(fieldErrors).flat()[0] : undefined;
  return firstFieldError ?? payload.message ?? fallback;
}
const head = 'px-4 py-3 font-semibold';
const cell = 'px-4 py-3 align-middle';
