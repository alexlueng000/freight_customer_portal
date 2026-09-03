'use client';
import { ChevronLeft, ChevronRight, Eye } from 'lucide-react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAuth } from '@/components/auth-provider';
import { EmptyState } from '@/components/empty-state';
import { ErrorState, PermissionDeniedState } from '@/components/error-state';
import { LoadingState } from '@/components/loading-state';
import { PageHeader } from '@/components/page-header';
import { StatusBadge } from '@/components/status-badge';
import { quoteStatusLabel, quoteStatusTone } from '@/lib/quote-status';

interface Quote {
  id: string;
  quoteNo: string;
  status: string;
  polCode: string;
  podCode: string;
  validUntil: string;
  currency: string;
  totalAmount: string;
  customer: { name: string };
}
interface QuoteList {
  items: Quote[];
  pagination: { total: number; totalPages: number };
}
export default function AdminQuotesPage() {
  const { apiFetch } = useAuth();
  const searchParams = useSearchParams();
  const status = searchParams.get('status') ?? '';
  const [page, setPage] = useState(1);
  const [data, setData] = useState<QuoteList | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<{ message: string; code?: string } | null>(null);
  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setData(await request<QuoteList>(apiFetch, `/api/v1/admin/quotes?page=${page}&pageSize=20`));
    } catch (caught) {
      setError(normalize(caught));
    } finally {
      setLoading(false);
    }
  }, [apiFetch, page]);
  useEffect(() => {
    void load();
  }, [load]);
  const visibleItems = useMemo(
    () => (status && data?.items ? data.items.filter((quote) => quote.status === status) : data?.items ?? []),
    [data?.items, status],
  );
  const pagination = data?.pagination;
  return (
    <div className="space-y-5">
      <PageHeader eyebrow="运营后台" title="报价" description="查看客户报价，进入详情核对后再确认发送。" />
      {error?.code === 'PERMISSION_DENIED' ? (
        <PermissionDeniedState />
      ) : (
        <section className="overflow-hidden rounded border border-border bg-surface">
          {error ? (
            <div className="p-4">
              <ErrorState description={error.message} onRetry={() => void load()} />
            </div>
          ) : loading ? (
            <LoadingState rows={6} />
          ) : !visibleItems.length ? (
            <div className="p-4">
              <EmptyState
                title={status === 'DRAFT' ? '当前没有待销售确认报价' : '暂无报价'}
                description={status === 'DRAFT' ? '客户提交报价申请后，待审核的 Quote 会显示在这里。' : '客户提交报价申请后会显示在这里。'}
              />
            </div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[900px] text-left text-sm">
                  <thead>
                    <tr className="border-b border-border bg-sidebar text-xs text-muted">
                      <th className={head}>报价编号</th>
                      <th className={head}>客户</th>
                      <th className={head}>航线</th>
                      <th className={head}>金额</th>
                      <th className={head}>有效期</th>
                      <th className={head}>状态</th>
                      <th className={`${head} text-right`}>操作</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visibleItems.map((quote) => (
                      <tr className="border-b border-border last:border-0" key={quote.id}>
                        <td className={cell}>
                          <Link
                            className="font-semibold text-primary hover:underline"
                            href={`/admin/quotes/${quote.id}`}
                          >
                            {quote.quoteNo}
                          </Link>
                        </td>
                        <td className={cell}>{quote.customer.name}</td>
                        <td className={cell}>
                          {quote.polCode} → {quote.podCode}
                        </td>
                        <td className={`${cell} font-semibold`}>
                          {money(quote.totalAmount, quote.currency)}
                        </td>
                        <td className={cell}>{quote.validUntil.slice(0, 10)}</td>
                        <td className={cell}>
                          <StatusBadge tone={quoteStatusTone(quote.status)}>
                            {quoteStatusLabel(quote.status)}
                          </StatusBadge>
                        </td>
                        <td className={`${cell} text-right`}>
                          {quote.status === 'DRAFT' ? (
                            <Link
                              className="inline-flex h-8 items-center gap-1.5 rounded border border-primary px-3 font-semibold text-primary hover:bg-primary/5"
                              href={`/admin/quotes/${quote.id}`}
                            >
                              <Eye className="size-3.5" />
                              查看审核
                            </Link>
                          ) : (
                            '—'
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="flex items-center justify-between border-t border-border px-4 py-3 text-sm text-muted">
                <span>共 {pagination?.total ?? visibleItems.length} 份</span>
                <div className="flex items-center gap-2">
                  <button
                    className={button}
                    disabled={page <= 1}
                    onClick={() => setPage((v) => v - 1)}
                  >
                    <ChevronLeft className="size-4" />
                  </button>
                  <span>
                    第 {page} / {Math.max(1, pagination?.totalPages ?? 1)} 页
                  </span>
                  <button
                    className={button}
                    disabled={page >= (pagination?.totalPages ?? 1)}
                    onClick={() => setPage((v) => v + 1)}
                  >
                    <ChevronRight className="size-4" />
                  </button>
                </div>
              </div>
            </>
          )}
        </section>
      )}
    </div>
  );
}
async function request<T>(
  apiFetch: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>,
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<T> {
  const response = await apiFetch(input, init);
  const payload: unknown = await response.json();
  if (!response.ok) throw payload;
  return payload as T;
}
function normalize(value: unknown) {
  const error = value as { message?: string; code?: string };
  return { message: error.message ?? '报价服务暂时不可用。', code: error.code };
}
function money(value: string, currency: string) {
  return `${currency} ${new Intl.NumberFormat('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(value))}`;
}
const head = 'px-4 py-3 font-semibold';
const cell = 'px-4 py-3 align-middle';
const button = 'grid size-9 place-items-center rounded border border-border disabled:opacity-40';
