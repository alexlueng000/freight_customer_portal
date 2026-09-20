'use client';
import Link from 'next/link';
import styles from './quote-review.module.css';
import { useParams } from 'next/navigation';
import { ArrowRight, CheckCircle2, MapPin, Package, TrendingUp, X } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '@/components/auth-provider';
import { BusinessFlow } from '@/components/business-flow';
import { ErrorState } from '@/components/error-state';
import { LoadingState } from '@/components/loading-state';
import { PageHeader } from '@/components/page-header';
import { FieldLabel } from '@/components/required-mark';
import { StatusBadge } from '@/components/status-badge';
import { resolveQuoteBusinessFlow } from '@/lib/business-flow';
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
  etd: string | null;
  validUntil: string;
  currency: string;
  totalAmount: string;
  containerQuantity: number | null;
  factoryLoadingDate: string | null;
  incoterm: string | null;
  pickupLocationText: string | null;
  deliveryLocationText: string | null;
  exportCustomsRemark: string | null;
  importCustomsRemark: string | null;
  customerRemarks: string | null;
  requestedServices: string[];
  cargoItems: Array<{
    id: string;
    commodity: string;
    estimatedGrossWeight: string | null;
    cargoNature: string | null;
    specialRequirement: string | null;
  }>;
  customerTerms: string | null;
  internalNote: string | null;
  priceOverrideReason: string | null;
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
  bookings: Array<{
    id: string;
    status: string;
    shipments: Array<{ id: string; status: string }>;
  }>;
  items: Item[];
}
export default function AdminQuoteDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { apiFetch } = useAuth();
  const [quote, setQuote] = useState<Quote | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [acting, setActing] = useState(false);
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
      setPrices(Object.fromEntries(nextQuote.items.map((item) => [item.id, item.unitPrice])));
      setReason('');
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
  const pricesChanged = Boolean(quote?.items.some((item) => normalizePrice(prices[item.id] ?? item.unitPrice) !== normalizePrice(item.unitPrice)));
  const reviewChanged = Boolean(quote && (review.validUntil !== quote.validUntil.slice(0, 10)
    || review.customerTerms !== (quote.customerTerms ?? '') || review.internalNote !== (quote.internalNote ?? '')));
  const hasUnsavedChanges = pricesChanged || reviewChanged;
  const saveQuote = async () => {
    if (!quote || reviewSaving || acting) return;
    setError('');
    if (!review.validUntil) {
      setError('请填写报价有效期。');
      return;
    }
    if (pricesChanged && reason.trim().length < 3) {
      setError('价格已调整，请填写至少 3 个字符的内部改价原因。');
      document.getElementById('inline-price-reason')?.focus();
      return;
    }
    if (pricesChanged && quote.items.some((item) => !/^\d{1,14}(?:\.\d{1,4})?$/.test((prices[item.id] ?? item.unitPrice).trim()))) {
      setError('销售单价须为非负金额，最多 4 位小数。');
      return;
    }
    if (pricesChanged && review.customerTerms.trim().length < 3) {
      setError('价格已调整，请补充客户可见报价条款（至少 3 个字符）。');
      document.getElementById('quote-customer-terms')?.focus();
      return;
    }
    setReviewSaving(true);
    setNotice(null);
    try {
      const response = await apiFetch('/api/v1/admin/quotes/' + encodeURIComponent(id) + (pricesChanged ? '/prices' : '/review'), {
        method: 'PATCH', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ ...review, ...(pricesChanged ? {
          reason: reason.trim(), items: quote.items.map((item) => ({ itemId: item.id, unitPrice: (prices[item.id] ?? item.unitPrice).trim() })),
        } : {}) }),
      });
      const payload: unknown = await response.json();
      if (!response.ok) throw payload;
      await load();
      setNotice({ title: '报价已保存', description: '价格、有效期和条款已保存，确认无误后可发布给客户。' });
    } catch (caught) {
      setError(errorMessage(caught, '报价保存失败，填写内容已保留。'));
    } finally { setReviewSaving(false); }
  };
  const confirmSend = async () => {
    if (hasUnsavedChanges || reviewSaving) { setConfirmingSend(false); setError('请先保存报价，再发布正式报价。'); return; }
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
  const businessFlow = resolveQuoteBusinessFlow(
    quote,
    quoteStatusLabel(quote.status),
    'admin',
  );
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
        eyebrow="销售 / 操作 · 报价审核"
        title={quote.quoteNo}
        description="核对客户需求、参考运价与报价金额，确认无误后再发布正式报价。"
        actions={
          <div className="flex gap-2">
            {quote.status === 'DRAFT' ? null : (
              <button
                className="h-9 rounded border border-border px-4 text-sm font-semibold disabled:opacity-40"
                disabled={acting || reviewSaving}
                onClick={() => void downloadPdf()}
                type="button"
              >
                下载 PDF
              </button>
            )}
            {canCancel ? (
              <button
                className="h-9 rounded border border-warning/30 px-4 text-sm font-semibold text-warning disabled:opacity-40"
                disabled={acting || reviewSaving}
                onClick={() => void act('cancel')}
                type="button"
              >
                作废
              </button>
            ) : null}
            {quote.status === 'DRAFT' ? (
              <button
                className="h-9 rounded bg-primary px-4 text-sm font-semibold text-surface disabled:opacity-40"
                disabled={acting || reviewSaving}
                onClick={() => { if (hasUnsavedChanges) { setError('请先保存报价，再发布正式报价。'); document.getElementById('quote-editor')?.scrollIntoView({ behavior: 'smooth', block: 'start' }); return; } setConfirmingSend(true); }}
                type="button"
              >
                发布正式报价
              </button>
            ) : null}
          </div>
        }
      />
      <BusinessFlow {...businessFlow} />
      <section className="grid gap-4 rounded border border-border bg-surface p-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        <Fact label="状态">
          <StatusBadge tone={quoteStatusTone(quote.status)}>
            {quoteStatusLabel(quote.status)}
          </StatusBadge>
        </Fact>
        <Fact label="客户" value={quote.customer.name} />
        <Fact
          label="船司 / 航线服务"
          value={
            [quote.carrierCode, quote.sourceRate?.serviceName].filter(Boolean).join(' / ') || '—'
          }
        />
        <Fact label="预计开船时间" value={quote.etd?.slice(0, 10) ?? '待确认'} />
        <Fact label="箱型 × 箱量" value={containerSummary} />
        <Fact label="来源运价" value={quote.sourceRate?.rateNo ?? '—'} />
      </section>
      <RouteSummary podCode={quote.podCode} polCode={quote.polCode} quoteItems={quote.items} />
      <QuoteRequestSummary quote={quote} />
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
      <section id="quote-editor" aria-label="报价编辑" className={styles.panel} data-tone="review">
        <div className={`${styles.panelHeader} flex flex-wrap items-center justify-between gap-3`}>
          <div>
            <h2 className={styles.heading}>{quote.status === 'DRAFT' ? '报价编辑' : '报价信息'}</h2>
            <p className="mt-1 text-xs text-muted">在此统一核对费用、有效期和条款，保存后再发布给客户。</p>
          </div>
          <span className="text-sm font-medium text-primary">{hasUnsavedChanges ? '有未保存的修改' : quote.status === 'DRAFT' ? '草稿 · 尚未发布' : '已保存 · 只读'}</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-left text-sm">
            <thead>
              <tr className="border-b border-border bg-sidebar text-xs text-muted">
                <th className={head}>费用</th>
                <th className={head}>计费方式</th>
                <th className={head}>计费数量</th>
                <th className={head}>参考运价（成本快照）</th>
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
                  <td className={cell}>{quote.status === 'DRAFT' ? <input
                    aria-label={item.chargeName + '销售单价（' + item.currency + '）'}
                    className="h-10 w-36 rounded border border-primary/30 bg-surface px-3 font-medium outline-none focus:border-primary focus:ring-2 focus:ring-primary/15"
                    disabled={reviewSaving || acting} inputMode="decimal" maxLength={19}
                    value={prices[item.id] ?? item.unitPrice}
                    onChange={(event) => setPrices((current) => ({ ...current, [item.id]: event.target.value }))} /> : money(item.unitPrice, item.currency)}</td>
                  <td className={`${cell} text-right font-semibold`}>
                    {pricesChanged ? '保存后更新' : money(item.amount, item.currency)}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className={styles.quoteTotal}>
                <td className="px-4 py-4 text-right font-semibold" colSpan={5}>
                  报价总额
                </td>
                <td className="px-4 py-4 text-right text-lg font-bold text-primary">
                  {pricesChanged ? '保存后重新计算' : money(quote.totalAmount, quote.currency)}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
        <div className="space-y-5 p-5">
          {pricesChanged ? <label className="block text-sm" htmlFor="inline-price-reason">
            <FieldLabel label="内部改价原因" required />
            <textarea id="inline-price-reason" className="mt-2 min-h-20 w-full rounded border border-border bg-surface p-3"
              disabled={reviewSaving || acting} value={reason} maxLength={500} onChange={(event) => setReason(event.target.value)}
              placeholder="说明调整价格的原因，至少 3 个字符，仅内部可见。" />
          </label> : null}
          <div className="flex flex-wrap items-end gap-x-6 gap-y-2">
            <label className="block w-full text-sm sm:w-56">
              <span className="font-medium">报价有效期至</span>
              <input className="mt-2 h-10 w-full rounded border border-border bg-surface px-3 outline-none focus:border-primary focus:ring-2 focus:ring-primary/15 disabled:bg-sidebar/50"
                disabled={quote.status !== 'DRAFT' || reviewSaving || acting}
                max={quote.sourceRate?.expiryDate.slice(0, 10)}
                onChange={(event) => setReview((value) => ({ ...value, validUntil: event.target.value }))}
                type="date" value={review.validUntil} />
            </label>
            <p className="pb-2 text-xs text-muted">{quote.sourceRate
              ? '不能晚于来源运价到期日：' + quote.sourceRate.expiryDate.slice(0, 10)
              : '请按与客户约定的报价有效期填写。'}</p>
          </div>
          <div className="grid gap-5 md:grid-cols-2">
            <label className={`${styles.fieldGroup} ${styles.customerField}`}>
              <span className="flex flex-wrap items-center gap-2 font-semibold">客户可见报价条款 <span className={styles.visibilityTag}>对客展示</span></span>
              <span className="mt-1 block text-xs text-muted">明确包含服务、不包含服务、费用及有效条件。客户勾选的需求不代表已承诺提供。</span>
              <textarea id="quote-customer-terms" className="mt-2 min-h-32 w-full rounded border border-border bg-surface p-3 outline-none focus:border-primary focus:ring-2 focus:ring-primary/15 disabled:bg-sidebar/50"
                disabled={quote.status !== 'DRAFT' || reviewSaving || acting} maxLength={2000}
                placeholder="包含服务与费用：…；不包含服务与费用：…；需另行确认的条件：…"
                onChange={(event) => setReview((value) => ({ ...value, customerTerms: event.target.value }))}
                value={review.customerTerms} />
            </label>
            <label className={`${styles.fieldGroup} ${styles.internalField}`}>
              <span className="flex flex-wrap items-center gap-2 font-semibold">内部备注 <span className={styles.visibilityTag}>仅内部</span></span>
              <span className="mt-1 block text-xs text-muted">仅内部员工可见，不展示给客户。</span>
              <textarea className="mt-2 min-h-32 w-full rounded border border-border bg-surface p-3 outline-none focus:border-primary focus:ring-2 focus:ring-primary/15 disabled:bg-sidebar/50"
                disabled={quote.status !== 'DRAFT' || reviewSaving || acting} maxLength={2000}
                placeholder="例如：待核实的采购成本、供应商沟通结果。"
                onChange={(event) => setReview((value) => ({ ...value, internalNote: event.target.value }))}
                value={review.internalNote} />
            </label>
          </div>
        </div>
        {quote.status === 'DRAFT' ? <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border bg-primary/5 px-5 py-4">
          <p className="text-sm text-muted">{hasUnsavedChanges ? '修改尚未保存，保存不会自动发布给客户。' : '当前内容已保存，可发布正式报价。'}</p>
          <button type="button" disabled={reviewSaving || acting || !hasUnsavedChanges}
            onClick={() => void saveQuote()} className="h-10 rounded bg-primary px-5 text-sm font-semibold text-surface disabled:opacity-40">
            {reviewSaving ? '保存中…' : '保存报价'}
          </button>
        </div> : null}
      </section>
      <details className={`${styles.sourcePanel} group`}>
        <summary className="cursor-pointer rounded px-5 py-4 text-sm outline-none focus-visible:ring-2 focus-visible:ring-primary">
          <span className="font-semibold">运价来源与发送记录</span>
          <span className="ml-3 text-xs text-muted">仅内部可见 · 展开核对供应商、合约和有效期</span>
        </summary>
        <div className="border-t border-border p-5">
          {quote.sourceRate ? (
            <div className="grid gap-x-6 gap-y-4 sm:grid-cols-2 lg:grid-cols-3">
              <SourceFact label="来源运价编号" value={quote.sourceRate.rateNo} />
              <SourceFact label="供应商" value={quote.sourceRate.supplierName || '未填写'} />
              <SourceFact label="合约编号" value={quote.sourceRate.contractNo || '未填写'} />
              <SourceFact label="航线服务" value={quote.sourceRate.serviceName || '未填写'} />
              <SourceFact label="运价有效期" value={quote.sourceRate.effectiveDate.slice(0, 10) + ' 至 ' + quote.sourceRate.expiryDate.slice(0, 10)} />
              <SourceFact label="预计航程" value={quote.sourceRate.transitDays == null ? '未填写' : quote.sourceRate.transitDays + ' 天'} />
            </div>
          ) : <p className="text-sm text-muted">这份报价未关联来源运价。</p>}
          <p className="mt-4 text-xs text-muted">用于追溯当前关联的运价。报价成本快照及利润请查看下方费用信息。</p>
          <div className="mt-4 border-t border-border pt-4 text-sm">
            {quote.sentAt
              ? '最近发送：' + new Date(quote.sentAt).toLocaleString('zh-CN') + ' · ' + (quote.sentBy?.displayName || '未记录发送人')
              : '尚未向客户发送正式报价。'}
          </div>
        </div>
      </details>
      <section aria-label="利润概览" className={styles.panel} data-tone="profit">
        <SectionHeader
          description={pricesChanged ? "以下为上次保存的利润，保存报价后将重新计算。" : "按已保存的报价、分币种汇总。"}
          icon={<TrendingUp aria-hidden className="size-4" />}
          title="利润概览"
        />
        <div className="divide-y divide-border">
          {pricingSummary.map((summary) => (
            <PricingSummaryRow summary={summary} key={summary.currency} />
          ))}
        </div>
      </section>
      <section aria-label="最近一次改价原因" className={`${styles.sourcePanel} p-5`}>
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="text-sm font-semibold">最近一次改价原因</h3>
          <span className="text-xs text-muted">仅内部可见</span>
        </div>
        <p className="mt-2 whitespace-pre-wrap break-words text-sm">
          {quote.priceOverrideReason || '暂无改价记录。'}
        </p>
        <p className="mt-2 text-xs text-muted">此处展示最近一次保存的原因；历次改价保留在审计日志中。</p>
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
                发布正式报价
              </h2>
              <p className="mt-1 text-sm text-muted">
                发布后状态将从待销售确认变为已发送，客户才可查看正式金额、下载 PDF、接受或拒绝报价。
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
                disabled={acting || reviewSaving}
                onClick={() => setConfirmingSend(false)}
                type="button"
              >
                取消
              </button>
              <button
                className="h-9 rounded bg-primary px-4 text-sm font-semibold text-surface disabled:opacity-40"
                disabled={acting || reviewSaving}
                onClick={() => void confirmSend()}
                type="button"
              >
                {acting ? '发布中…' : '确认发布'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function QuoteRequestSummary({ quote }: { quote: Quote }) {
  return (
    <section aria-label="客户运输需求" className={styles.panel} data-tone="customer">
      <div className={styles.panelHeader}>
        <h2 className={styles.heading}>客户运输需求</h2>
        <p className="mt-1 text-xs text-muted">
          客户提交报价申请时填写，供销售核价和确认服务范围。
        </p>
      </div>
      <div className="grid gap-4 border-b border-border p-4 sm:grid-cols-2 lg:grid-cols-4">
        <Fact
          label="箱量"
          value={quote.containerQuantity === null ? '—' : String(quote.containerQuantity)}
        />
        <Fact label="贸易条款" value={quote.incoterm ?? '—'} />
        <Fact label="提货地点" value={quote.pickupLocationText ?? '—'} />
        <Fact label="工厂预计装货日期" value={quote.factoryLoadingDate?.slice(0, 10) ?? '未提供'} />
        <Fact label="派送地点" value={quote.deliveryLocationText ?? '—'} />
        <Fact label="出口报关备注" value={quote.exportCustomsRemark ?? '—'} />
        <Fact label="进口清关备注" value={quote.importCustomsRemark ?? '—'} />
        <Fact label="客户备注" value={quote.customerRemarks ?? '—'} />
        <Fact
          label="委托服务"
          value={
            quote.requestedServices.length
              ? quote.requestedServices.map(requestedServiceLabel).join('、')
              : '仅港到港海运'
          }
        />
      </div>
      <div className="divide-y divide-border">
        {quote.cargoItems.length ? (
          quote.cargoItems.map((item, index) => (
            <div className="grid gap-4 p-4 sm:grid-cols-3" key={item.id}>
              <Fact label={`货物 ${index + 1}`} value={item.commodity} />
              <Fact
                label="预计重量"
                value={
                  item.estimatedGrossWeight === null
                    ? '—'
                    : `${Number(item.estimatedGrossWeight).toLocaleString()} kg`
                }
              />
              <Fact label="货物性质" value={item.cargoNature ?? '—'} />
              <Fact label="特殊要求" value={item.specialRequirement ?? '无'} />
            </div>
          ))
        ) : (
          <p className="p-4 text-sm text-muted">历史报价未填写货物明细。</p>
        )}
      </div>
    </section>
  );
}

function requestedServiceLabel(code: string) {
  return (
    (
      {
        ORIGIN_PICKUP: '起运地拖车 / 提货',
        EXPORT_CUSTOMS: '出口报关',
        IMPORT_CUSTOMS: '目的港清关',
        DESTINATION_DELIVERY: '目的地派送',
      } as Record<string, string>
    )[code] ?? code
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
            <div className="text-sm font-bold text-success">正式报价已发布</div>
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
    <div className={`${styles.panelHeader} flex items-start gap-3`}>
      <div className={styles.headerIcon}>
        {icon}
      </div>
      <div>
        <h2 className={styles.heading}>{title}</h2>
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
    <div className="min-w-0">
      <div className="text-xs text-muted">{label}</div>
      <div className={`mt-1 break-words text-sm ${emphasis ? 'font-bold text-foreground' : 'font-semibold'}`}>
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
  if (item.chargeBasis === 'PER_SHIPMENT') return '/票';
  return item.containerType
    ? `/${item.containerType} ${containerTypeLabel(item.containerType)}`
    : '/箱';
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
  const summaries = new Map<
    string,
    { currency: string; cost: number; sell: number; profit: number }
  >();
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

function normalizePrice(value: string) {
  const [whole, fraction = ''] = value.trim().split('.');
  return `${(whole ?? '').replace(/^0+(?=\d)/, '')}.${fraction.replace(/0+$/, '')}`;
}
