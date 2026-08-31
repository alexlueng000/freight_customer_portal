'use client';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '@/components/auth-provider';
import { ErrorState } from '@/components/error-state';
import { LoadingState } from '@/components/loading-state';
import { PageHeader } from '@/components/page-header';
import { StatusBadge } from '@/components/status-badge';
import { quoteStatusLabel, quoteStatusTone } from '@/lib/quote-status';

interface Item {
  id: string;
  chargeName: string;
  containerType: string | null;
  quantity: string;
  unitPrice: string;
  amount: string;
  costAmount: string | null;
  currency: string;
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
  customer: { name: string };
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
  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const response = await apiFetch(`/api/v1/admin/quotes/${encodeURIComponent(id)}`);
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
  const act = async (action: 'send' | 'expire') => {
    setActing(true);
    setError('');
    try {
      const response = await apiFetch(`/api/v1/admin/quotes/${encodeURIComponent(id)}/${action}`, {
        method: 'POST',
      });
      const payload: unknown = await response.json();
      if (!response.ok) throw payload;
      await load();
    } catch (caught) {
      setError((caught as { message?: string }).message ?? '报价操作失败。');
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
      setError((caught as { message?: string }).message ?? 'PDF 下载失败。');
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
      setError((caught as { message?: string }).message ?? '价格调整失败。');
    } finally {
      setActing(false);
    }
  };
  const confirmSend = async () => {
    await act('send');
    setConfirmingSend(false);
  };
  if (loading) return <LoadingState rows={6} />;
  if (error && !quote) return <ErrorState description={error} onRetry={() => void load()} />;
  if (!quote) return null;
  const open = ['DRAFT', 'SENT', 'VIEWED'].includes(quote.status);
  return (
    <div className="space-y-5">
      <Link className="text-sm text-primary hover:underline" href="/admin/quotes">
        ← 返回报价列表
      </Link>
      <PageHeader
        eyebrow={quote.customer.name}
        title={quote.quoteNo}
        description={`${quote.polCode} → ${quote.podCode}`}
        actions={
          <div className="flex gap-2">
            <button
              className="h-9 rounded border border-border px-4 text-sm font-semibold disabled:opacity-40"
              disabled={acting}
              onClick={() => void downloadPdf()}
              type="button"
            >
              下载 PDF
            </button>
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
            {open ? (
              <button
                className="h-9 rounded border border-warning/30 px-4 text-sm font-semibold text-warning disabled:opacity-40"
                disabled={acting}
                onClick={() => void act('expire')}
                type="button"
              >
                标记过期
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
      {error ? (
        <div className="rounded border border-danger/20 bg-danger/10 px-4 py-3 text-sm text-danger">
          {error}
        </div>
      ) : null}
      {editing ? (
        <section className="space-y-4 rounded border border-primary/20 bg-primary/5 p-4">
          <div>
            <h2 className="font-semibold">销售手工改价</h2>
            <p className="text-xs text-muted">仅草稿可调整；原价、修改价、原因和操作人会被保留。</p>
          </div>
          <div className="grid gap-3">
            {quote.items.map((item) => (
              <label
                className="grid gap-1 text-sm sm:grid-cols-[1fr_180px] sm:items-center"
                key={item.id}
              >
                <span>
                  {item.chargeName} / {item.containerType ?? '按票'}
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
            <span className="font-medium">改价原因 *</span>
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
      <section className="overflow-hidden rounded border border-border bg-surface">
        <table className="w-full min-w-[760px] text-left text-sm">
          <thead>
            <tr className="border-b border-border bg-sidebar text-xs text-muted">
              <th className={head}>费用</th>
              <th className={head}>箱型</th>
              <th className={head}>数量</th>
              <th className={head}>成本快照</th>
              <th className={head}>销售单价</th>
              <th className={`${head} text-right`}>金额</th>
            </tr>
          </thead>
          <tbody>
            {quote.items.map((item) => (
              <tr className="border-b border-border" key={item.id}>
                <td className={cell}>{item.chargeName}</td>
                <td className={cell}>{item.containerType ?? '—'}</td>
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
              <Fact label="航线" value={`${quote.polCode} → ${quote.podCode}`} />
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
function money(value: string, currency: string) {
  return `${currency} ${new Intl.NumberFormat('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(value))}`;
}
const head = 'px-4 py-3 font-semibold';
const cell = 'px-4 py-3 align-middle';
