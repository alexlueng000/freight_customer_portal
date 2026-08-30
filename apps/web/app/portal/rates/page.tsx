'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { ChevronLeft, ChevronRight, Search, X } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { useAuth } from '@/components/auth-provider';
import { EmptyState } from '@/components/empty-state';
import { ErrorState, PermissionDeniedState } from '@/components/error-state';
import { LoadingState } from '@/components/loading-state';
import { PageHeader } from '@/components/page-header';

interface CustomerRate {
  id: string;
  polCode: string;
  polName: string;
  podCode: string;
  podName: string;
  carrierCode: string;
  serviceName: string | null;
  effectiveDate: string;
  expiryDate: string;
  etd: string | null;
  transitDays: number | null;
  containerType: string;
  oceanSellAmount: string;
  sellAmount: string;
  charges: Array<{
    id: string;
    chargeName: string;
    chargeBasis: 'PER_CONTAINER' | 'PER_BL' | 'PER_SHIPMENT';
    containerType: string | null;
    amount: string;
    currency: string;
  }>;
  currency: string;
}
interface RateSearchResponse {
  items: CustomerRate[];
  pagination: { page: number; pageSize: number; total: number; totalPages: number };
}
interface ApiErrorPayload {
  code?: string;
  message?: string;
}
class PortalRateApiError extends Error {
  constructor(
    message: string,
    readonly code?: string,
  ) {
    super(message);
  }
}

const searchSchema = z
  .object({
    polCode: z
      .string()
      .trim()
      .min(3, '请输入起运港代码')
      .max(10)
      .regex(/^[A-Za-z0-9]+$/, '仅支持字母和数字'),
    podCode: z
      .string()
      .trim()
      .min(3, '请输入目的港代码')
      .max(10)
      .regex(/^[A-Za-z0-9]+$/, '仅支持字母和数字'),
    etdFrom: z.string().min(1, '请选择最早离港日'),
    etdTo: z.string().min(1, '请选择最晚离港日'),
    containerType: z.string().min(1, '请选择箱型'),
    carrierCode: z
      .string()
      .trim()
      .refine((value) => !value || /^[A-Za-z0-9]{2,20}$/.test(value), '船司代码格式不正确'),
  })
  .superRefine((value, context) => {
    if (value.etdFrom && value.etdTo && value.etdFrom > value.etdTo)
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['etdTo'],
        message: '最晚离港日不能早于最早离港日',
      });
  });
type SearchValues = z.infer<typeof searchSchema>;

export default function PortalRatesPage() {
  const { apiFetch } = useAuth();
  const router = useRouter();
  const defaults = defaultDates();
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<SearchValues>({
    resolver: zodResolver(searchSchema),
    defaultValues: {
      polCode: '',
      podCode: '',
      etdFrom: defaults.from,
      etdTo: defaults.to,
      containerType: '40HQ',
      carrierCode: '',
    },
  });
  const [criteria, setCriteria] = useState<SearchValues | null>(null);
  const [items, setItems] = useState<CustomerRate[]>([]);
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState<RateSearchResponse['pagination']>({
    page: 1,
    pageSize: 20,
    total: 0,
    totalPages: 0,
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<PortalRateApiError | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [creatingRateId, setCreatingRateId] = useState<string | null>(null);
  const [selectedRate, setSelectedRate] = useState<CustomerRate | null>(null);
  const [quoteQuantity, setQuoteQuantity] = useState('1');
  const [quoteRequestError, setQuoteRequestError] = useState('');
  const createQuote = async (rate: CustomerRate, quantity: number) => {
    setCreatingRateId(rate.id);
    setQuoteRequestError('');
    try {
      const quote = await requestJson<{ id: string }>(apiFetch, '/api/v1/quotes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rateId: rate.id, containerType: rate.containerType, quantity }),
      });
      router.push(`/portal/quotes/${quote.id}`);
    } catch (caught) {
      setQuoteRequestError(toPortalRateError(caught).message);
    } finally {
      setCreatingRateId(null);
    }
  };
  const search = useCallback(async () => {
    if (!criteria) return;
    setLoading(true);
    setError(null);
    const query = new URLSearchParams({
      page: String(page),
      pageSize: '20',
      polCode: criteria.polCode.toUpperCase(),
      podCode: criteria.podCode.toUpperCase(),
      etdFrom: criteria.etdFrom,
      etdTo: criteria.etdTo,
      containerType: criteria.containerType,
    });
    if (criteria.carrierCode) query.set('carrierCode', criteria.carrierCode.toUpperCase());
    try {
      const result = await requestJson<RateSearchResponse>(
        apiFetch,
        `/api/v1/portal/rates?${query.toString()}`,
      );
      setItems(result.items);
      setPagination(result.pagination);
    } catch (caught) {
      setError(toPortalRateError(caught));
    } finally {
      setLoading(false);
    }
  }, [apiFetch, criteria, page]);
  useEffect(() => {
    void search();
  }, [reloadKey, search]);
  const submit = handleSubmit((values) => {
    setPage(1);
    setCriteria({
      ...values,
      polCode: values.polCode.trim(),
      podCode: values.podCode.trim(),
      carrierCode: values.carrierCode.trim(),
    });
  });
  return (
    <div className="space-y-5">
      <PageHeader
        description="输入航线、离港日期和箱型，查询适用于贵司的销售价格。"
        eyebrow="客户门户"
        title="运价查询"
      />
      <section className="rounded border border-border bg-surface">
        <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border px-4 py-3">
          <div>
            <h2 className="text-sm font-semibold">查询条件</h2>
            <p className="mt-1 text-xs text-muted">港口代码建议使用 UN/LOCODE，例如 CNSHA、USLAX。</p>
          </div>
          <p className="rounded-md border border-danger/20 bg-danger/5 px-2.5 py-1.5 text-xs font-medium text-foreground">
            <span className="mr-1 text-danger" aria-hidden>*</span>为必填项
          </p>
        </div>
        <form
          className="grid gap-4 p-4 md:grid-cols-2 xl:grid-cols-6"
          onSubmit={(event) => void submit(event)}
        >
          <FormField error={errors.polCode?.message} label="起运港 POL" required>
            <input {...register('polCode')} aria-invalid={Boolean(errors.polCode)} className={inputClass} placeholder="CNSHA" required />
          </FormField>
          <FormField error={errors.podCode?.message} label="目的港 POD" required>
            <input {...register('podCode')} aria-invalid={Boolean(errors.podCode)} className={inputClass} placeholder="USLAX" required />
          </FormField>
          <FormField error={errors.etdFrom?.message} label="最早离港日" required>
            <input {...register('etdFrom')} aria-invalid={Boolean(errors.etdFrom)} className={inputClass} required type="date" />
          </FormField>
          <FormField error={errors.etdTo?.message} label="最晚离港日" required>
            <input {...register('etdTo')} aria-invalid={Boolean(errors.etdTo)} className={inputClass} required type="date" />
          </FormField>
          <FormField error={errors.containerType?.message} label="箱型" required>
            <select {...register('containerType')} aria-invalid={Boolean(errors.containerType)} className={inputClass} required>
              {['20GP', '40GP', '40HQ', '45HQ'].map((type) => (
                <option key={type}>{type}</option>
              ))}
            </select>
          </FormField>
          <FormField error={errors.carrierCode?.message} label="船司（可选）">
            <input {...register('carrierCode')} className={inputClass} placeholder="COSCO" />
          </FormField>
          <div className="col-span-full flex justify-end">
            <button
              className="inline-flex h-9 items-center gap-2 rounded bg-primary px-5 text-sm font-semibold text-surface disabled:opacity-50"
              disabled={isSubmitting || loading}
              type="submit"
            >
              <Search className="size-4" /> {loading ? '查询中…' : '查询运价'}
            </button>
          </div>
        </form>
      </section>
      {error?.code === 'PERMISSION_DENIED' ? (
        <PermissionDeniedState />
      ) : (
        <section className="overflow-hidden rounded border border-border bg-surface">
          <div className="flex items-center justify-between border-b border-border px-4 py-3">
            <div>
              <h2 className="text-sm font-semibold">查询结果</h2>
              <p className="mt-1 text-xs text-muted">
                仅展示贵司适用的最终销售价，不含内部采购和供应商信息。
              </p>
            </div>
            {criteria && !loading && !error ? (
              <span className="text-sm text-muted">{pagination.total} 个方案</span>
            ) : null}
          </div>
          {loading ? (
            <LoadingState rows={5} />
          ) : error ? (
            <div className="p-4">
              <ErrorState
                description={error.message}
                onRetry={() => setReloadKey((value) => value + 1)}
              />
            </div>
          ) : !criteria ? (
            <div className="p-4">
              <EmptyState
                description="填写上方查询条件后，匹配的有效运价会显示在这里。"
                title="开始查询运价"
              />
            </div>
          ) : items.length === 0 ? (
            <div className="p-4">
              <EmptyState
                description="当前条件下暂无有效方案，请调整日期、港口、箱型或船司。"
                title="没有匹配的运价"
              />
            </div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[900px] border-collapse text-left text-sm">
                  <thead>
                    <tr className="border-b border-border bg-sidebar text-xs text-muted">
                      <th className={headerClass}>船司 / 服务</th>
                      <th className={headerClass}>航线</th>
                      <th className={headerClass}>ETD</th>
                      <th className={headerClass}>航程</th>
                      <th className={headerClass}>箱型</th>
                      <th className={headerClass}>销售价</th>
                      <th className={headerClass}>有效期</th>
                      <th className={`${headerClass} text-right`}>操作</th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((rate) => (
                      <tr
                        className="border-b border-border last:border-0 hover:bg-sidebar/60"
                        key={rate.id}
                      >
                        <td className={cellClass}>
                          <div className="font-medium">{rate.carrierCode}</div>
                          <div className="mt-0.5 text-xs text-muted">
                            {rate.serviceName ?? '标准服务'}
                          </div>
                        </td>
                        <td className={cellClass}>
                          <div>
                            {rate.polCode} → {rate.podCode}
                          </div>
                          <div className="mt-0.5 text-xs text-muted">
                            {rate.polName} → {rate.podName}
                          </div>
                        </td>
                        <td className={cellClass}>
                          {rate.etd ? formatDate(rate.etd) : '船期待确认'}
                        </td>
                        <td className={cellClass}>
                          {rate.transitDays === null ? '—' : `${rate.transitDays} 天`}
                        </td>
                        <td className={cellClass}>{rate.containerType}</td>
                        <td className={cellClass}>
                          <span className="text-base font-semibold text-primary">
                            {formatMoney(rate.sellAmount, rate.currency)}
                          </span>
                          {rate.charges.length ? (
                            <div className="mt-1 text-xs text-muted">
                              主运价 {formatMoney(rate.oceanSellAmount, rate.currency)} +{' '}
                              {rate.charges.length} 项附加费
                            </div>
                          ) : null}
                        </td>
                        <td className={cellClass}>
                          <div>{formatDate(rate.effectiveDate)}</div>
                          <div className="mt-0.5 text-xs text-muted">
                            至 {formatDate(rate.expiryDate)}
                          </div>
                        </td>
                        <td className={`${cellClass} text-right`}>
                          <button
                            className="h-8 rounded bg-primary px-3 text-sm font-semibold text-surface disabled:cursor-not-allowed disabled:opacity-45"
                            disabled={creatingRateId !== null}
                            onClick={() => {
                              setSelectedRate(rate);
                              setQuoteQuantity('1');
                              setQuoteRequestError('');
                            }}
                            type="button"
                          >
                            申请报价
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="flex items-center justify-between border-t border-border px-4 py-3 text-sm text-muted">
                <span>共 {pagination.total} 个方案</span>
                <div className="flex items-center gap-2">
                  <button
                    aria-label="上一页"
                    className={pageButtonClass}
                    disabled={page <= 1}
                    onClick={() => setPage((value) => Math.max(1, value - 1))}
                    type="button"
                  >
                    <ChevronLeft className="size-4" />
                  </button>
                  <span>
                    第 {pagination.page} / {Math.max(1, pagination.totalPages)} 页
                  </span>
                  <button
                    aria-label="下一页"
                    className={pageButtonClass}
                    disabled={page >= pagination.totalPages}
                    onClick={() => setPage((value) => value + 1)}
                    type="button"
                  >
                    <ChevronRight className="size-4" />
                  </button>
                </div>
              </div>
            </>
          )}
        </section>
      )}
      {selectedRate ? (
        <QuoteRequestDialog
          error={quoteRequestError}
          quantity={quoteQuantity}
          rate={selectedRate}
          submitting={creatingRateId === selectedRate.id}
          onClose={() => {
            if (creatingRateId) return;
            setSelectedRate(null);
            setQuoteRequestError('');
          }}
          onQuantityChange={setQuoteQuantity}
          onSubmit={() => {
            const quantity = Number(quoteQuantity);
            if (!Number.isInteger(quantity) || quantity < 1 || quantity > 999) {
              setQuoteRequestError('箱量必须是 1–999 之间的整数。');
              return;
            }
            void createQuote(selectedRate, quantity);
          }}
        />
      ) : null}
    </div>
  );
}

function QuoteRequestDialog({
  rate,
  quantity,
  error,
  submitting,
  onQuantityChange,
  onClose,
  onSubmit,
}: {
  rate: CustomerRate;
  quantity: string;
  error: string;
  submitting: boolean;
  onQuantityChange: (value: string) => void;
  onClose: () => void;
  onSubmit: () => void;
}) {
  const numericQuantity = Number(quantity);
  const validQuantity = Number.isInteger(numericQuantity) && numericQuantity >= 1 && numericQuantity <= 999;
  const estimate = validQuantity ? quoteEstimate(rate, numericQuantity) : null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/35 p-4" role="presentation">
      <section aria-labelledby="quote-request-title" aria-modal="true" className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-lg border border-border bg-surface shadow-xl" role="dialog">
        <div className="sticky top-0 z-10 flex items-start justify-between border-b border-border bg-surface px-5 py-4">
          <div>
            <h2 className="text-lg font-semibold" id="quote-request-title">确认报价申请</h2>
            <p className="mt-1 text-sm text-muted">确认箱量和预估费用后提交，由销售审核并发送正式报价。</p>
          </div>
          <button aria-label="关闭报价申请" className="grid size-9 place-items-center rounded border border-border" disabled={submitting} onClick={onClose} type="button"><X className="size-4" /></button>
        </div>
        <div className="space-y-5 p-5">
          <section className="grid gap-4 rounded-md border border-border bg-sidebar/50 p-4 sm:grid-cols-2 lg:grid-cols-4">
            <QuoteFact label="航线" value={`${rate.polCode} → ${rate.podCode}`} />
            <QuoteFact label="船司" value={rate.carrierCode} />
            <QuoteFact label="ETD" value={rate.etd ? formatDate(rate.etd) : '船期待确认'} />
            <QuoteFact label="有效期至" value={formatDate(rate.expiryDate)} />
          </section>
          <label className="block text-sm">
            <span className="font-semibold">箱量 <span className="text-danger">*</span></span>
            <span className="mt-1 block text-xs text-muted">本次报价的 {rate.containerType} 集装箱数量</span>
            <div className="mt-2 flex items-center gap-3">
              <input aria-invalid={!validQuantity} className="h-10 w-32 rounded border border-border bg-surface px-3 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/15 aria-[invalid=true]:border-danger" inputMode="numeric" max={999} min={1} onChange={(event) => onQuantityChange(event.target.value)} required type="number" value={quantity} />
              <span className="text-sm font-medium">× {rate.containerType}</span>
            </div>
          </label>
          <section className="overflow-hidden rounded-md border border-border">
            <div className="border-b border-border bg-sidebar px-4 py-3 text-sm font-semibold">费用预估</div>
            <div className="divide-y divide-border text-sm">
              <QuoteEstimateRow amount={validQuantity ? Number(rate.oceanSellAmount) * numericQuantity : null} currency={rate.currency} label="海运费" quantity={validQuantity ? numericQuantity : null} unitPrice={Number(rate.oceanSellAmount)} />
              {rate.charges.map((charge) => {
                const itemQuantity = charge.chargeBasis === 'PER_CONTAINER' ? numericQuantity : 1;
                return <QuoteEstimateRow amount={validQuantity ? Number(charge.amount) * itemQuantity : null} currency={charge.currency} key={charge.id} label={charge.chargeName} quantity={validQuantity ? itemQuantity : null} unitPrice={Number(charge.amount)} />;
              })}
            </div>
            <div className="flex items-center justify-between bg-primary/5 px-4 py-4">
              <span className="font-semibold">预估总额</span>
              <span className="text-lg font-bold text-primary">{estimate === null ? '—' : formatMoney(String(estimate), rate.currency)}</span>
            </div>
          </section>
          <div className="rounded-md border border-warning/25 bg-warning/10 px-4 py-3 text-sm text-foreground">
            提交后将生成“待销售确认”的报价草稿。销售可审核或调整价格；正式发送后，你才能接受、拒绝或下载正式报价 PDF。
          </div>
          {error ? <div className="rounded border border-danger/20 bg-danger/10 px-4 py-3 text-sm text-danger">{error}</div> : null}
        </div>
        <div className="flex justify-end gap-2 border-t border-border px-5 py-4">
          <button className="h-9 rounded border border-border px-4 text-sm font-semibold" disabled={submitting} onClick={onClose} type="button">取消</button>
          <button className="h-9 rounded bg-primary px-5 text-sm font-semibold text-surface disabled:cursor-not-allowed disabled:opacity-45" disabled={submitting || !validQuantity} onClick={onSubmit} type="button">{submitting ? '提交中…' : '提交报价申请'}</button>
        </div>
      </section>
    </div>
  );
}

function QuoteFact({ label, value }: { label: string; value: string }) {
  return <div><div className="text-xs text-muted">{label}</div><div className="mt-1 font-semibold">{value}</div></div>;
}

function QuoteEstimateRow({ label, quantity, unitPrice, amount, currency }: { label: string; quantity: number | null; unitPrice: number; amount: number | null; currency: string }) {
  return <div className="grid grid-cols-[1fr_auto] items-center gap-4 px-4 py-3"><div><div className="font-medium">{label}</div><div className="mt-0.5 text-xs text-muted">{quantity === null ? '请输入有效箱量' : `${quantity} × ${formatMoney(String(unitPrice), currency)}`}</div></div><div className="font-semibold">{amount === null ? '—' : formatMoney(String(amount), currency)}</div></div>;
}

function quoteEstimate(rate: CustomerRate, quantity: number) {
  return rate.charges.reduce((total, charge) => total + Number(charge.amount) * (charge.chargeBasis === 'PER_CONTAINER' ? quantity : 1), Number(rate.oceanSellAmount) * quantity);
}
function FormField({
  label,
  error,
  required = false,
  children,
}: {
  label: string;
  error?: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className="block text-sm">
      <span className="inline-flex items-center gap-1 font-semibold">
        {label}
        {required ? <span className="text-base leading-none text-danger" aria-label="必填">*</span> : null}
      </span>
      <span className="mt-1.5 block">{children}</span>
      {error ? <span className="mt-1 block text-xs text-danger">{error}</span> : null}
    </label>
  );
}
async function requestJson<T>(
  apiFetch: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>,
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<T> {
  const response = await apiFetch(input, init);
  const payload = (await response.json().catch(() => undefined)) as T | ApiErrorPayload | undefined;
  if (!response.ok) {
    const error = payload as ApiErrorPayload | undefined;
    throw new PortalRateApiError(error?.message ?? '运价查询暂时不可用，请稍后重试。', error?.code);
  }
  return payload as T;
}
function toPortalRateError(error: unknown) {
  return error instanceof PortalRateApiError
    ? error
    : new PortalRateApiError(
        error instanceof Error ? error.message : '运价查询暂时不可用，请稍后重试。',
      );
}
function defaultDates() {
  const from = new Date();
  const to = new Date(from.getTime() + 30 * 86_400_000);
  return { from: from.toISOString().slice(0, 10), to: to.toISOString().slice(0, 10) };
}
function formatDate(value: string) {
  return value.slice(0, 10);
}
function formatMoney(value: string, currency: string) {
  return `${currency} ${new Intl.NumberFormat('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(value))}`;
}
const inputClass =
  'h-10 w-full rounded border border-border bg-surface px-3 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/15 aria-[invalid=true]:border-danger aria-[invalid=true]:ring-2 aria-[invalid=true]:ring-danger/10';
const headerClass = 'px-4 py-3 font-semibold';
const cellClass = 'px-4 py-3 align-middle';
const pageButtonClass =
  'grid size-9 place-items-center rounded border border-border disabled:cursor-not-allowed disabled:opacity-40';
