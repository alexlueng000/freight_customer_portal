'use client';
import { quoteAmounts } from '@/lib/quote-amounts';
import { ChevronLeft, ChevronRight, Eye, Plus } from 'lucide-react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from '@/components/auth-provider';
import { EmptyState } from '@/components/empty-state';
import { ErrorState, PermissionDeniedState } from '@/components/error-state';
import { LoadingState } from '@/components/loading-state';
import { PageHeader } from '@/components/page-header';
import { StatusBadge } from '@/components/status-badge';
import { hasPermission } from '@/lib/auth';
import { customerQuoteStatusLabel, quoteStatusTone } from '@/lib/quote-status';

interface Quote {
  id: string;
  quoteNo: string;
  status: string;
  polCode: string;
  podCode: string;
  polDisplayName?: string;
  podDisplayName?: string;
  carrierCode: string | null;
  etd: string | null;
  validUntil: string;
  currency: string;
  totalAmount: string | null;
  amountsByCurrency?: Record<string, string> | null;
  sentAt: string | null;
}
interface QuoteList {
  items: Quote[];
  pagination: { page: number; total: number; totalPages: number };
}
export default function QuotesPage() {
  const { apiFetch, user } = useAuth();
  const canCreateBooking = hasPermission(user, 'booking.create');
  const router = useRouter();
  const searchParams = useSearchParams();
  const filterKey = searchParams.toString();
  const [filters, setFilters] = useState(() =>
    Object.fromEntries(filterFields.map(({ key }) => [key, searchParams.get(key) ?? ''])),
  );
  const [page, setPage] = useState(1);
  const [data, setData] = useState<QuoteList | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<{ message: string; code?: string } | null>(null);
  const [actionError, setActionError] = useState('');
  const [creatingQuoteId, setCreatingQuoteId] = useState<string | null>(null);
  const requestId = useRef(0);
  useEffect(() => {
    const params = new URLSearchParams(filterKey);
    setFilters(Object.fromEntries(filterFields.map(({ key }) => [key, params.get(key) ?? ''])));
    setPage(1);
  }, [filterKey]);
  const load = useCallback(async () => {
    const currentRequest = ++requestId.current;
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams(filterKey);
      if (params.get('status') === 'pending') {
        params.delete('status');
        params.set('statuses', 'SENT,VIEWED,ACCEPTED');
      }
      params.set('page', String(page));
      params.set('pageSize', '20');
      const response = await apiFetch(`/api/v1/quotes?${params}`);
      const payload: unknown = await response.json();
      if (currentRequest !== requestId.current) return;
      if (!response.ok) throw payload;
      setData(payload as QuoteList);
    } catch (caught) {
      if (currentRequest !== requestId.current) return;
      const value = caught as { message?: string; code?: string };
      setError({ message: value.message ?? '报价列表加载失败，请稍后重试。', code: value.code });
    } finally {
      if (currentRequest === requestId.current) setLoading(false);
    }
  }, [apiFetch, page, filterKey]);
  useEffect(() => {
    void load();
  }, [load]);
  const visibleItems = data?.items ?? [];
  const hasFilters = filterFields.some(({ key }) => searchParams.get(key));
  const applyFilters = (reset = false) => {
    const params = new URLSearchParams();
    if (!reset)
      for (const { key } of filterFields) {
        if (filters[key]?.trim()) params.set(key, filters[key].trim());
      }
    setPage(1);
    if (reset) setFilters(Object.fromEntries(filterFields.map(({ key }) => [key, ''])));
    router.replace(`/portal/quotes${params.size ? `?${params}` : ''}`, { scroll: false });
  };
  const pagination = data?.pagination;
  const createBooking = async (quote: Quote) => {
    setCreatingQuoteId(quote.id);
    setActionError('');
    try {
      const response = await apiFetch('/api/v1/bookings', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ quoteId: quote.id }),
      });
      const payload = (await response.json()) as { id?: string; message?: string };
      if (!response.ok || !payload.id) throw new Error(payload.message ?? '创建订舱失败。');
      router.push(`/portal/bookings/${payload.id}`);
    } catch (caught) {
      setActionError((caught as { message?: string }).message ?? '创建订舱失败，请刷新后重试。');
    } finally {
      setCreatingQuoteId(null);
    }
  };
  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="客户门户"
        title="我的报价"
        description="查看报价申请、销售确认进度及可决策的正式报价。"
      />
      <form
        className="flex flex-wrap items-end gap-3 rounded border border-border bg-surface p-4"
        onSubmit={(event) => {
          event.preventDefault();
          applyFilters();
        }}
      >
        {filterFields.map(({ key, label, placeholder }) => (
          <label className="min-w-36 flex-1 text-sm" key={key}>
            <span id={`quote-filter-${key}-label`} className="mb-1.5 block font-medium">{label}</span>
            {key === 'status' ? (
              <select
                aria-labelledby={`quote-filter-${key}-label`}
                className={filterInput}
                value={filters[key] ?? ''}
                onChange={(event) => setFilters({ ...filters, [key]: event.target.value })}
              >
                <option value="">全部状态</option>
                <option value="pending">待我处理</option>
                {[
                  'DRAFT',
                  'SENT',
                  'VIEWED',
                  'ACCEPTED',
                  'BOOKED',
                  'REJECTED',
                  'EXPIRED',
                  'CANCELLED',
                ].map((value) => (
                  <option key={value} value={value}>
                    {customerQuoteStatusLabel(value)}
                  </option>
                ))}
              </select>
            ) : (
              <input
                className={filterInput}
                maxLength={100}
                placeholder={placeholder}
                value={filters[key] ?? ''}
                onChange={(event) => setFilters({ ...filters, [key]: event.target.value })}
              />
            )}
          </label>
        ))}
        <div className="flex gap-2">
          <button
            className="h-10 rounded bg-primary px-4 text-sm font-semibold text-surface hover:bg-primary/90"
            type="submit"
          >
            查询
          </button>
          <button
            className="h-10 rounded border border-border px-4 text-sm hover:bg-sidebar"
            type="button"
            onClick={() => applyFilters(true)}
          >
            重置
          </button>
        </div>
      </form>
      {actionError ? (
        <div className="rounded border border-danger/20 bg-danger/10 px-4 py-3 text-sm text-danger">
          {actionError}
        </div>
      ) : null}
      <section className="overflow-hidden rounded border border-border bg-surface">
        {loading ? (
          <LoadingState rows={6} />
        ) : error?.code === 'PERMISSION_DENIED' ? (
          <PermissionDeniedState />
        ) : error ? (
          <div className="p-4">
            <ErrorState description={error.message} onRetry={() => void load()} />
          </div>
        ) : !visibleItems.length ? (
          <div className="p-4">
            <EmptyState
              title={hasFilters ? '没有符合条件的报价' : '还没有报价'}
              description={
                hasFilters
                  ? '请调整筛选条件，或点击重置查看全部报价。'
                  : '请先前往运价查询，选择方案提交报价申请。'
              }
            />
          </div>
        ) : (
          <>
            <div className="divide-y divide-border md:hidden">
              {visibleItems.map((quote) => {
                const href = `/portal/quotes/${quote.id}`;
                return (
                  <article className="space-y-3 px-4 py-4" key={quote.id}>
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <Link className="font-semibold text-primary hover:underline" href={href}>
                          {quote.quoteNo}
                        </Link>
                        <div className="mt-1 text-sm text-foreground">
                          <QuoteRoute quote={quote} />
                        </div>
                      </div>
                      <StatusBadge tone={quoteStatusTone(quote.status)}>
                        {customerQuoteStatusLabel(quote.status)}
                      </StatusBadge>
                    </div>
                    <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                      <div>
                        <dt className="text-xs text-muted">船司 / 预计开船时间</dt>
                        <dd className="mt-0.5 font-medium">
                          {quote.carrierCode ?? '待确认'} ·{' '}
                          {quote.etd ? quote.etd.slice(0, 10) : '待确认'}
                        </dd>
                      </div>
                      <div className="text-right">
                        <dt className="text-xs text-muted">金额</dt>
                        <dd className="mt-0.5 font-semibold text-primary">
                          {quote.sentAt === null || quote.totalAmount === null
                            ? '销售审核中'
                            : quoteAmounts(quote)}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-xs text-muted">有效期</dt>
                        <dd className="mt-0.5 font-medium">{quote.validUntil.slice(0, 10)}</dd>
                      </div>
                    </dl>
                    <div className="grid grid-cols-2 gap-2">
                      <Link
                        aria-label={`查看报价 ${quote.quoteNo}`}
                        className="inline-flex h-11 items-center justify-center gap-1.5 rounded border border-border bg-surface px-3 text-sm font-medium text-foreground"
                        href={href}
                      >
                        <Eye aria-hidden className="size-4" />
                        查看
                      </Link>
                      {canCreateBooking && quote.status === 'ACCEPTED' ? (
                        <button
                          aria-label={`基于报价 ${quote.quoteNo} 创建订舱`}
                          className="inline-flex h-11 items-center justify-center gap-1.5 rounded bg-primary px-3 text-sm font-semibold text-surface disabled:cursor-not-allowed disabled:opacity-60"
                          disabled={creatingQuoteId !== null}
                          onClick={() => void createBooking(quote)}
                          type="button"
                        >
                          <Plus aria-hidden className="size-4" />
                          {creatingQuoteId === quote.id ? '创建中…' : '创建订舱'}
                        </button>
                      ) : null}
                    </div>
                  </article>
                );
              })}
            </div>
            <div className="hidden overflow-x-auto md:block">
              <table className="w-full min-w-[850px] text-left text-sm">
                <thead>
                  <tr className="border-b border-border bg-sidebar text-xs text-muted">
                    <th className={head}>报价编号</th>
                    <th className={head}>航线</th>
                    <th className={head}>船司 / 预计开船时间</th>
                    <th className={head}>金额</th>
                    <th className={head}>有效期</th>
                    <th className={head}>状态</th>
                    <th className={`${head} min-w-44 whitespace-nowrap text-right`}>操作</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleItems.map((quote) => {
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
                          <QuoteRoute quote={quote} />
                        </td>
                        <td className={cell}>
                          {quote.carrierCode ?? '—'}
                          <div className="text-xs text-muted">
                            {quote.etd ? quote.etd.slice(0, 10) : '船期待确认'}
                          </div>
                        </td>
                        <td className={`${cell} font-semibold`}>
                          {quote.sentAt === null || quote.totalAmount === null
                            ? '销售审核中'
                            : quoteAmounts(quote)}
                        </td>
                        <td className={cell}>{quote.validUntil.slice(0, 10)}</td>
                        <td className={cell}>
                          <StatusBadge tone={quoteStatusTone(quote.status)}>
                            {customerQuoteStatusLabel(quote.status)}
                          </StatusBadge>
                        </td>
                        <td className={`${cell} min-w-44 whitespace-nowrap text-right`}>
                          <div className="flex justify-end gap-2">
                            {canCreateBooking && quote.status === 'ACCEPTED' ? (
                              <button
                                aria-label={`基于报价 ${quote.quoteNo} 创建订舱`}
                                className="inline-flex h-8 shrink-0 items-center gap-1.5 whitespace-nowrap rounded bg-primary px-3 text-xs font-semibold text-surface transition hover:bg-primary/90 focus:outline-none focus:ring-2 focus:ring-primary/20 disabled:cursor-not-allowed disabled:opacity-60"
                                disabled={creatingQuoteId !== null}
                                onClick={(event) => {
                                  event.stopPropagation();
                                  void createBooking(quote);
                                }}
                                type="button"
                              >
                                <Plus aria-hidden className="size-3.5" />
                                {creatingQuoteId === quote.id ? '创建中…' : '创建订舱'}
                              </button>
                            ) : null}
                            <Link
                              aria-label={`查看报价 ${quote.quoteNo}`}
                              className="inline-flex h-8 shrink-0 items-center gap-1.5 whitespace-nowrap rounded border border-border bg-surface px-3 text-xs font-medium text-foreground transition hover:border-primary/40 hover:bg-primary/5 hover:text-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
                              href={href}
                              onClick={(event) => event.stopPropagation()}
                            >
                              <Eye aria-hidden className="size-3.5" />
                              查看
                            </Link>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div className="flex items-center justify-between border-t border-border px-4 py-3 text-sm text-muted">
              <span>共 {pagination?.total ?? visibleItems.length} 份</span>
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
                  第 {page} / {Math.max(1, pagination?.totalPages ?? 1)} 页
                </span>
                <button
                  aria-label="下一页"
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
    </div>
  );
}
const head = 'px-4 py-3 font-semibold';
const cell = 'px-4 py-3 align-middle';
const button = 'grid size-9 place-items-center rounded border border-border disabled:opacity-40';
const filterInput =
  'h-10 w-full rounded border border-border bg-surface px-3 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20';
const filterFields = [
  { key: 'quoteNo', label: '报价编号', placeholder: '输入报价编号' },
  { key: 'status', label: '状态', placeholder: '' },
  { key: 'pol', label: '起运港', placeholder: '中文 / 英文 / 代码' },
  { key: 'pod', label: '目的港', placeholder: '中文 / 英文 / 代码' },
  { key: 'carrierCode', label: '船司', placeholder: '如 COSCO' },
];
function QuoteRoute({ quote }: { quote: Quote }) {
  const pol = quote.polDisplayName || quote.polCode;
  const pod = quote.podDisplayName || quote.podCode;
  return (
    <>
      <div className="font-medium">
        {pol} → {pod}
      </div>
      {pol !== quote.polCode || pod !== quote.podCode ? (
        <div className="mt-1 text-xs text-muted">
          {quote.polCode} → {quote.podCode}
        </div>
      ) : null}
    </>
  );
}
