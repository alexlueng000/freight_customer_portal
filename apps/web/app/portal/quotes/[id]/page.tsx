'use client';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '@/components/auth-provider';
import { ErrorState } from '@/components/error-state';
import { LoadingState } from '@/components/loading-state';
import { PageHeader } from '@/components/page-header';
import { StatusBadge } from '@/components/status-badge';
import { quoteStatusLabel, quoteStatusTone } from '@/lib/quote-status';

interface Item {
  id: string;
  chargeCode: string;
  chargeName: string;
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
  version: number;
  items: Item[];
}
export default function QuoteDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { apiFetch } = useAuth();
  const [quote, setQuote] = useState<Quote | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [actionError, setActionError] = useState('');
  const [submitting, setSubmitting] = useState<'accept' | 'reject' | null>(null);
  const [confirmingAccept, setConfirmingAccept] = useState(false);
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
  const decide = async (action: 'accept' | 'reject') => {
    setSubmitting(action);
    setActionError('');
    try {
      const response = await apiFetch(`/api/v1/quotes/${encodeURIComponent(id)}/${action}`, {
        method: 'POST',
      });
      const payload: unknown = await response.json();
      if (!response.ok) throw payload;
      await load();
    } catch (caught) {
      setActionError((caught as { message?: string }).message ?? '报价操作失败，请刷新后重试。');
    } finally {
      setSubmitting(null);
    }
  };
  const confirmAccept = async () => {
    await decide('accept');
    setConfirmingAccept(false);
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
            {['SENT', 'VIEWED'].includes(quote.status) ? (
              <>
                <button
                  className="h-9 rounded border border-danger/30 px-4 text-sm font-semibold text-danger disabled:opacity-40"
                  disabled={submitting !== null}
                  onClick={() => void decide('reject')}
                  type="button"
                >
                  {submitting === 'reject' ? '处理中…' : '拒绝报价'}
                </button>
                <button
                  className="h-9 rounded bg-primary px-4 text-sm font-semibold text-surface disabled:opacity-40"
                  disabled={submitting !== null}
                  onClick={() => setConfirmingAccept(true)}
                  type="button"
                >
                  {submitting === 'accept' ? '处理中…' : '接受报价'}
                </button>
              </>
            ) : null}
            {quote.status === 'ACCEPTED' ? (
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
        description={`${quote.polCode} → ${quote.podCode}`}
      />
      {actionError ? (
        <div className="rounded border border-danger/20 bg-danger/10 px-4 py-3 text-sm text-danger">
          {actionError}
        </div>
      ) : null}
      {quote.status === 'DRAFT' ? (
        <div className="rounded border border-warning/25 bg-warning/10 px-4 py-3 text-sm text-foreground">
          报价申请已提交，正在等待销售确认。销售正式发送后，你可以下载 PDF、接受或拒绝报价。
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
            {quoteStatusLabel(quote.status)}
          </StatusBadge>
        </Fact>
        <Fact label="船司" value={quote.carrierCode ?? '—'} />
        <Fact label="ETD" value={quote.etd?.slice(0, 10) ?? '船期待确认'} />
        <Fact label="有效期至" value={quote.validUntil.slice(0, 10)} />
      </section>
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
                <th className={head}>箱型</th>
                <th className={head}>数量</th>
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
                  <td className={cell}>{item.containerType ?? '—'}</td>
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
      {confirmingAccept ? (
        <div
          aria-labelledby="accept-quote-title"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/35 p-4"
          role="dialog"
        >
          <div className="w-full max-w-md rounded border border-border bg-surface shadow-xl">
            <div className="border-b border-border px-5 py-4">
              <h2 className="text-base font-semibold" id="accept-quote-title">
                确认接受报价
              </h2>
              <p className="mt-1 text-sm text-muted">
                接受后报价将进入已接受状态，后续可基于该报价创建订舱。
              </p>
            </div>
            <div className="space-y-3 px-5 py-4 text-sm">
              <Fact label="报价编号" value={quote.quoteNo} />
              <Fact label="航线" value={`${quote.polCode} → ${quote.podCode}`} />
              <Fact label="有效期至" value={quote.validUntil.slice(0, 10)} />
              <Fact label="报价总额" value={money(quote.totalAmount, quote.currency)} />
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
const head = 'px-4 py-3 font-semibold';
const cell = 'px-4 py-3 align-middle';
function money(value: string, currency: string) {
  return `${currency} ${new Intl.NumberFormat('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(value))}`;
}
