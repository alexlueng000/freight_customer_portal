'use client';
import { ChevronLeft, ChevronRight, Eye } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '@/components/auth-provider';
import { EmptyState } from '@/components/empty-state';
import { ErrorState, PermissionDeniedState } from '@/components/error-state';
import { LoadingState } from '@/components/loading-state';
import { PageHeader } from '@/components/page-header';
import { StatusBadge } from '@/components/status-badge';
import { customerQuoteStatusLabel, quoteStatusTone } from '@/lib/quote-status';

interface Quote {
  id: string;
  quoteNo: string;
  status: string;
  polCode: string;
  podCode: string;
  carrierCode: string | null;
  etd: string | null;
  validUntil: string;
  currency: string;
  totalAmount: string;
}
interface QuoteList {
  items: Quote[];
  pagination: { page: number; total: number; totalPages: number };
}
export default function QuotesPage() {
  const { apiFetch } = useAuth();
  const router = useRouter();
  const [page, setPage] = useState(1);
  const [data, setData] = useState<QuoteList | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<{ message: string; code?: string } | null>(null);
  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await apiFetch(`/api/v1/quotes?page=${page}&pageSize=20`);
      const payload: unknown = await response.json();
      if (!response.ok) throw payload;
      setData(payload as QuoteList);
    } catch (caught) {
      const value = caught as { message?: string; code?: string };
      setError({ message: value.message ?? '报价列表加载失败，请稍后重试。', code: value.code });
    } finally {
      setLoading(false);
    }
  }, [apiFetch, page]);
  useEffect(() => {
    void load();
  }, [load]);
  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="客户门户"
        title="我的报价"
        description="查看报价申请、销售确认进度及可决策的正式报价。"
      />
      <section className="overflow-hidden rounded border border-border bg-surface">
        {loading ? (
          <LoadingState rows={6} />
        ) : error?.code === 'PERMISSION_DENIED' ? (
          <PermissionDeniedState />
        ) : error ? (
          <div className="p-4">
            <ErrorState description={error.message} onRetry={() => void load()} />
          </div>
        ) : !data?.items.length ? (
          <div className="p-4">
            <EmptyState title="暂无报价" description="请先前往运价查询，选择方案提交报价申请。" />
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[850px] text-left text-sm">
                <thead>
                  <tr className="border-b border-border bg-sidebar text-xs text-muted">
                    <th className={head}>报价编号</th>
                    <th className={head}>航线</th>
                    <th className={head}>船司 / ETD</th>
                    <th className={head}>金额</th>
                    <th className={head}>有效期</th>
                    <th className={head}>状态</th>
                    <th className={`${head} min-w-28 whitespace-nowrap text-right`}>操作</th>
                  </tr>
                </thead>
                <tbody>
                  {data.items.map((quote) => {
                    const href = `/portal/quotes/${quote.id}`;
                    return (
                      <tr
                        aria-label={`查看报价 ${quote.quoteNo}`}
                        className="cursor-pointer border-b border-border transition-colors last:border-0 hover:bg-sidebar/70 focus:bg-sidebar focus:outline-none focus:ring-2 focus:ring-inset focus:ring-primary/20"
                        key={quote.id}
                        onClick={() => router.push(href)}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter' || event.key === ' ') {
                            event.preventDefault();
                            router.push(href);
                          }
                        }}
                        role="link"
                        tabIndex={0}
                      >
                        <td className={cell}>
                          <span className="font-semibold text-primary">{quote.quoteNo}</span>
                        </td>
                        <td className={cell}>
                          {quote.polCode} → {quote.podCode}
                        </td>
                        <td className={cell}>
                          {quote.carrierCode ?? '—'}
                          <div className="text-xs text-muted">
                            {quote.etd ? quote.etd.slice(0, 10) : '船期待确认'}
                          </div>
                        </td>
                        <td className={`${cell} font-semibold`}>
                          {money(quote.totalAmount, quote.currency)}
                        </td>
                        <td className={cell}>{quote.validUntil.slice(0, 10)}</td>
                        <td className={cell}>
                          <StatusBadge tone={quoteStatusTone(quote.status)}>
                            {customerQuoteStatusLabel(quote.status)}
                          </StatusBadge>
                        </td>
                        <td className={`${cell} min-w-28 whitespace-nowrap text-right`}>
                          <Link
                            aria-label={`查看报价 ${quote.quoteNo}`}
                            className="inline-flex h-8 shrink-0 items-center gap-1.5 whitespace-nowrap rounded border border-border bg-surface px-3 text-xs font-medium text-foreground transition hover:border-primary/40 hover:bg-primary/5 hover:text-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
                            href={href}
                            onClick={(event) => event.stopPropagation()}
                          >
                            <Eye aria-hidden className="size-3.5" />
                            查看
                          </Link>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div className="flex items-center justify-between border-t border-border px-4 py-3 text-sm text-muted">
              <span>共 {data.pagination.total} 份</span>
              <div className="flex items-center gap-2">
                <button
                  aria-label="上一页"
                  className={button}
                  disabled={page <= 1}
                  onClick={() => setPage((v) => v - 1)}
                >
                  <ChevronLeft className="size-4" />
                </button>
                <span>
                  第 {page} / {Math.max(1, data.pagination.totalPages)} 页
                </span>
                <button
                  aria-label="下一页"
                  className={button}
                  disabled={page >= data.pagination.totalPages}
                  onClick={() => setPage((v) => v + 1)}
                >
                  <ChevronRight className="size-4" />
                </button>
              </div>
            </div>
          </>
        )}
      </section>
    </div>
  );
}
const head = 'px-4 py-3 font-semibold';
const cell = 'px-4 py-3 align-middle';
const button = 'grid size-9 place-items-center rounded border border-border disabled:opacity-40';
function money(value: string, currency: string) {
  return `${currency} ${new Intl.NumberFormat('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(value))}`;
}
