'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { ChevronLeft, ChevronRight, Plus, Search, Trash2, X } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { useAuth } from '@/components/auth-provider';
import { EmptyState } from '@/components/empty-state';
import { ErrorState, PermissionDeniedState } from '@/components/error-state';
import { LoadingState } from '@/components/loading-state';
import { PageHeader } from '@/components/page-header';
import { FieldLabel, RequiredLegend } from '@/components/required-mark';
import { hasPermission } from '@/lib/auth';

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
  details?: { fieldErrors?: Record<string, string[]> };
}
const requestedServiceOptions = [
  { code: 'ORIGIN_PICKUP', label: '起运地拖车 / 提货' },
  { code: 'EXPORT_CUSTOMS', label: '出口报关' },
  { code: 'IMPORT_CUSTOMS', label: '目的港清关' },
  { code: 'DESTINATION_DELIVERY', label: '目的地派送' },
] as const;
type RequestedServiceCode = (typeof requestedServiceOptions)[number]['code'];
const incotermOptions = ['EXW', 'FCA', 'FOB', 'CFR', 'CIF', 'DAP', 'DDP', 'OTHER'] as const;
interface QuoteRequestValues {
  quantity: string;
  cargoItems: Array<{
    clientId: string;
    commodity: string;
    estimatedGrossWeightKg: string;
    cargoNature: string;
    specialRequirement: string;
  }>;
  pickupLocation: string;
  deliveryLocation: string;
  exportCustomsRemark: string;
  importCustomsRemark: string;
  customerRemarks: string;
  incoterm: '' | (typeof incotermOptions)[number];
  requestedServices: RequestedServiceCode[];
}
let nextCargoItemId = 1;
function newCargoItem(): QuoteRequestValues['cargoItems'][number] {
  return {
    clientId: `cargo-${nextCargoItemId++}`,
    commodity: '',
    estimatedGrossWeightKg: '',
    cargoNature: '',
    specialRequirement: '',
  };
}
const quoteRequestSchema = z
  .object({
  quantity: z.string().refine((value) => {
    const quantity = Number(value);
    return Number.isInteger(quantity) && quantity >= 1 && quantity <= 999;
  }, '箱量必须是 1–999 之间的整数。'),
  cargoItems: z
    .array(
      z.object({
        clientId: z.string(),
        commodity: z
          .string()
          .trim()
          .min(1, '请填写货物品名。')
          .max(500, '货物品名不能超过 500 字。'),
        estimatedGrossWeightKg: z.string().refine((value) => {
          if (!value.trim()) return true;
          const weight = Number(value);
          return Number.isFinite(weight) && weight > 0 && weight <= 999999999;
        }, '请输入大于 0 的重量。'),
        cargoNature: z.string().trim().max(200, '货物性质不能超过 200 字。'),
        specialRequirement: z.string().trim().max(2000, '特殊要求不能超过 2000 字。'),
      }),
    )
    .min(1, '请至少添加一种货物。')
    .max(50, '一次报价最多添加 50 种货物。'),
  pickupLocation: z.string().trim().max(1000, '提货地点不能超过 1000 字。'),
  deliveryLocation: z.string().trim().max(1000, '派送地点不能超过 1000 字。'),
  exportCustomsRemark: z.string().trim().max(1000, '出口报关备注不能超过 1000 字。'),
  importCustomsRemark: z.string().trim().max(1000, '进口清关备注不能超过 1000 字。'),
  customerRemarks: z.string().trim().max(2000, '客户备注不能超过 2000 字。'),
  incoterm: z.union([z.literal(''), z.enum(incotermOptions)]),
  requestedServices: z.array(
    z.enum(['ORIGIN_PICKUP', 'EXPORT_CUSTOMS', 'IMPORT_CUSTOMS', 'DESTINATION_DELIVERY']),
  ),
  })
  .superRefine((value, context) => {
    if (value.requestedServices.includes('ORIGIN_PICKUP') && !value.pickupLocation.trim())
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['pickupLocation'],
        message: '选择起运地拖车后，请填写 Pickup Location。',
      });
    if (
      value.requestedServices.includes('DESTINATION_DELIVERY') &&
      !value.deliveryLocation.trim()
    )
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['deliveryLocation'],
        message: '选择目的地派送后，请填写 Delivery Location。',
      });
  });
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
      .max(10)
      .refine((value) => !value || value.length >= 3, '起运港代码至少 3 位')
      .refine((value) => !value || /^[A-Za-z0-9]+$/.test(value), '仅支持字母和数字'),
    podCode: z
      .string()
      .trim()
      .max(10)
      .refine((value) => !value || value.length >= 3, '目的港代码至少 3 位')
      .refine((value) => !value || /^[A-Za-z0-9]+$/.test(value), '仅支持字母和数字'),
    etdFrom: z.string().min(1, '请选择最早离港日'),
    etdTo: z.string().min(1, '请选择最晚离港日'),
    containerType: z.string(),
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
  const { apiFetch, user } = useAuth();
  const canCreateQuote = hasPermission(user, 'quote.create');
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
      containerType: '',
      carrierCode: '',
    },
  });
  const [criteria, setCriteria] = useState<SearchValues | null>(null);
  const [items, setItems] = useState<CustomerRate[]>([]);
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState<RateSearchResponse['pagination']>({
    page: 1,
    pageSize: 5,
    total: 0,
    totalPages: 0,
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<PortalRateApiError | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [creatingRateId, setCreatingRateId] = useState<string | null>(null);
  const [selectedRate, setSelectedRate] = useState<CustomerRate | null>(null);
  const [quoteRequestError, setQuoteRequestError] = useState('');
  const createQuote = async (rate: CustomerRate, values: QuoteRequestValues) => {
    setCreatingRateId(rate.id);
    setQuoteRequestError('');
    try {
      const quote = await requestJson<{ id: string }>(apiFetch, '/api/v1/quotes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          rateId: rate.id,
          containerType: rate.containerType,
          containerQuantity: Number(values.quantity),
          incoterm: values.incoterm || undefined,
          cargoItems: values.cargoItems.map((item) => ({
            commodity: item.commodity.trim(),
            ...(item.estimatedGrossWeightKg.trim()
              ? { estimatedGrossWeight: Number(item.estimatedGrossWeightKg) }
              : {}),
            cargoNature: item.cargoNature.trim() || undefined,
            specialRequirement: item.specialRequirement.trim() || undefined,
          })),
          pickupLocationText: values.pickupLocation.trim() || undefined,
          deliveryLocationText: values.deliveryLocation.trim() || undefined,
          exportCustomsRemark: values.exportCustomsRemark.trim() || undefined,
          importCustomsRemark: values.importCustomsRemark.trim() || undefined,
          customerRemarks: values.customerRemarks.trim() || undefined,
          requestedServices: values.requestedServices,
        }),
      });
      router.push(`/portal/quotes/${quote.id}`);
    } catch (caught) {
      setQuoteRequestError(toPortalRateError(caught).message);
    } finally {
      setCreatingRateId(null);
    }
  };
  const search = useCallback(async () => {
    setLoading(true);
    setError(null);
    const query = new URLSearchParams({ page: String(page), pageSize: '5' });
    if (criteria) {
      query.set('etdFrom', criteria.etdFrom);
      query.set('etdTo', criteria.etdTo);
      if (criteria.polCode) query.set('polCode', criteria.polCode.toUpperCase());
      if (criteria.podCode) query.set('podCode', criteria.podCode.toUpperCase());
      if (criteria.containerType) query.set('containerType', criteria.containerType);
      if (criteria.carrierCode) query.set('carrierCode', criteria.carrierCode.toUpperCase());
    }
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
        description="浏览贵司当前可用运价，也可按航线、日期、箱型和船司缩小范围。"
        eyebrow="客户门户"
        title="运价查询"
      />
      <section className="rounded border border-border bg-surface">
        <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border px-4 py-3">
          <div>
            <h2 className="text-sm font-semibold">查询条件</h2>
            <p className="mt-1 text-xs text-muted">
              港口代码建议使用 UN/LOCODE，例如 CNSHA、USLAX。
            </p>
          </div>
          <p className="rounded-md border border-danger/20 bg-danger/5 px-2.5 py-1.5 text-xs font-medium text-foreground">
            <RequiredLegend>离港日期为必填筛选条件</RequiredLegend>
          </p>
        </div>
        <form
          className="grid gap-4 p-4 md:grid-cols-2 xl:grid-cols-6"
          onSubmit={(event) => void submit(event)}
        >
          <FormField error={errors.polCode?.message} label="起运港 POL（可选）">
            <input
              {...register('polCode')}
              aria-invalid={Boolean(errors.polCode)}
              className={inputClass}
              placeholder="CNSHA"
            />
          </FormField>
          <FormField error={errors.podCode?.message} label="目的港 POD（可选）">
            <input
              {...register('podCode')}
              aria-invalid={Boolean(errors.podCode)}
              className={inputClass}
              placeholder="USLAX"
            />
          </FormField>
          <FormField error={errors.etdFrom?.message} label="最早离港日" required>
            <input
              {...register('etdFrom')}
              aria-invalid={Boolean(errors.etdFrom)}
              className={inputClass}
              required
              type="date"
            />
          </FormField>
          <FormField error={errors.etdTo?.message} label="最晚离港日" required>
            <input
              {...register('etdTo')}
              aria-invalid={Boolean(errors.etdTo)}
              className={inputClass}
              required
              type="date"
            />
          </FormField>
          <FormField error={errors.containerType?.message} label="箱型（可选）">
            <select
              {...register('containerType')}
              aria-invalid={Boolean(errors.containerType)}
              className={inputClass}
            >
              <option value="">全部箱型</option>
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
              <Search className="size-4" /> {loading ? '筛选中…' : '筛选运价'}
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
              <h2 className="text-sm font-semibold">{criteria ? '查询结果' : '公司运价'}</h2>
              <p className="mt-1 text-xs text-muted">
                {criteria
                  ? '以下为符合当前筛选条件的在线参考价。'
                  : '这里展示货代公司已发布、可供贵司查询的在线参考价。'}
              </p>
            </div>
            {!loading && !error ? (
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
          ) : items.length === 0 ? (
            <div className="p-4">
              <EmptyState
                description={
                  criteria
                    ? '当前条件下暂无方案，请调整日期、港口、箱型或船司。'
                    : '货代公司暂未发布可供客户查询的运价，请联系业务人员。'
                }
                title={criteria ? '没有匹配的运价' : '暂无已发布运价'}
              />
            </div>
          ) : (
            <>
              <div className="divide-y divide-border md:hidden">
                {items.map((rate) => (
                  <article className="space-y-3 px-4 py-4" key={`${rate.id}-${rate.containerType}`}>
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="font-semibold text-foreground">
                          {rate.polCode} → {rate.podCode}
                        </div>
                        <div className="mt-1 text-xs text-muted">
                          {rate.polName} → {rate.podName}
                        </div>
                      </div>
                      <div className="shrink-0 text-right">
                        <div className="text-base font-semibold text-primary">
                          {formatMoney(rate.sellAmount, rate.currency)}
                        </div>
                        <div className="mt-0.5 text-xs text-muted">{rate.containerType}</div>
                      </div>
                    </div>
                    <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                      <div>
                        <dt className="text-xs text-muted">船司 / 服务</dt>
                        <dd className="mt-0.5 font-medium">
                          {rate.carrierCode} · {rate.serviceName ?? '标准服务'}
                        </dd>
                      </div>
                      <div className="text-right">
                        <dt className="text-xs text-muted">ETD / 航程</dt>
                        <dd className="mt-0.5 font-medium">
                          {rate.etd ? formatDate(rate.etd) : '待确认'} ·{' '}
                          {rate.transitDays === null ? '—' : `${rate.transitDays} 天`}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-xs text-muted">有效期</dt>
                        <dd className="mt-0.5 font-medium">
                          {formatDate(rate.effectiveDate)} 至 {formatDate(rate.expiryDate)}
                        </dd>
                      </div>
                      {rate.charges.length ? (
                        <div className="text-right">
                          <dt className="text-xs text-muted">附加费</dt>
                          <dd className="mt-0.5 font-medium">{rate.charges.length} 项</dd>
                        </div>
                      ) : null}
                    </dl>
                    {canCreateQuote ? (
                      <button
                        className="h-11 w-full rounded bg-primary px-3 text-sm font-semibold text-surface disabled:cursor-not-allowed disabled:opacity-45"
                        disabled={creatingRateId !== null}
                        onClick={() => {
                          setSelectedRate(rate);
                          setQuoteRequestError('');
                        }}
                        type="button"
                      >
                        获取正式报价
                      </button>
                    ) : null}
                  </article>
                ))}
              </div>
              <div className="hidden overflow-x-auto md:block">
                <table className="w-full min-w-[900px] border-collapse text-left text-sm">
                  <thead>
                    <tr className="border-b border-border bg-sidebar text-xs text-muted">
                      <th className={headerClass}>船司 / 服务</th>
                      <th className={headerClass}>航线</th>
                      <th className={headerClass}>ETD</th>
                      <th className={headerClass}>航程</th>
                      <th className={headerClass}>箱型</th>
                      <th className={headerClass}>预计总价</th>
                      <th className={headerClass}>有效期</th>
                      {canCreateQuote ? (
                        <th className={`${headerClass} text-right`}>操作</th>
                      ) : null}
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((rate) => (
                      <tr
                        className="border-b border-border last:border-0 hover:bg-sidebar/60"
                        key={`${rate.id}-${rate.containerType}`}
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
                              海运费 {formatMoney(rate.oceanSellAmount, rate.currency)} +{' '}
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
                        {canCreateQuote ? (
                          <td className={`${cellClass} text-right`}>
                            <button
                              className="h-8 rounded bg-primary px-3 text-sm font-semibold text-surface disabled:cursor-not-allowed disabled:opacity-45"
                              disabled={creatingRateId !== null}
                              onClick={() => {
                                setSelectedRate(rate);
                                setQuoteRequestError('');
                              }}
                              type="button"
                            >
                              获取正式报价
                            </button>
                          </td>
                        ) : null}
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
      {canCreateQuote && selectedRate ? (
        <QuoteRequestDialog
          error={quoteRequestError}
          rate={selectedRate}
          submitting={creatingRateId === selectedRate.id}
          onClose={() => {
            if (creatingRateId) return;
            setSelectedRate(null);
            setQuoteRequestError('');
          }}
          onSubmit={(values) => void createQuote(selectedRate, values)}
        />
      ) : null}
    </div>
  );
}

function QuoteRequestDialog({
  rate,
  error,
  submitting,
  onClose,
  onSubmit,
}: {
  rate: CustomerRate;
  error: string;
  submitting: boolean;
  onClose: () => void;
  onSubmit: (values: QuoteRequestValues) => void;
}) {
  const [values, setValues] = useState<QuoteRequestValues>({
    quantity: '1',
    cargoItems: [newCargoItem()],
    pickupLocation: '',
    deliveryLocation: '',
    exportCustomsRemark: '',
    importCustomsRemark: '',
    customerRemarks: '',
    incoterm: '',
    requestedServices: [],
  });
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const numericQuantity = Number(values.quantity);
  const validQuantity =
    Number.isInteger(numericQuantity) && numericQuantity >= 1 && numericQuantity <= 999;
  const estimate = validQuantity ? quoteEstimate(rate, numericQuantity) : null;
  const submit = () => {
    const result = quoteRequestSchema.safeParse(values);
    if (!result.success) {
      setFieldErrors(
        Object.fromEntries(
          result.error.issues.map((issue) => [issue.path.join('.'), issue.message]),
        ),
      );
      return;
    }
    setFieldErrors({});
    onSubmit(result.data);
  };
  const update = <K extends keyof QuoteRequestValues>(key: K, value: QuoteRequestValues[K]) => {
    setValues((current) => ({ ...current, [key]: value }));
    setFieldErrors((current) => ({ ...current, [key]: '' }));
  };
  const updateCargoItem = (
    index: number,
    field: 'commodity' | 'estimatedGrossWeightKg' | 'cargoNature' | 'specialRequirement',
    value: string,
  ) => {
    setValues((current) => ({
      ...current,
      cargoItems: current.cargoItems.map((item, itemIndex) =>
        itemIndex === index ? { ...item, [field]: value } : item,
      ),
    }));
    setFieldErrors((current) => ({ ...current, [`cargoItems.${index}.${field}`]: '' }));
  };
  const addCargoItem = () =>
    setValues((current) =>
      current.cargoItems.length >= 50
        ? current
        : { ...current, cargoItems: [...current.cargoItems, newCargoItem()] },
    );
  const removeCargoItem = (index: number) => {
    if (values.cargoItems.length === 1) return;
    setValues((current) => ({
      ...current,
      cargoItems: current.cargoItems.filter((_, itemIndex) => itemIndex !== index),
    }));
    setFieldErrors({});
  };
  const toggleRequestedService = (code: RequestedServiceCode, checked: boolean) => {
    update(
      'requestedServices',
      checked
        ? [...values.requestedServices, code]
        : values.requestedServices.filter((serviceCode) => serviceCode !== code),
    );
    if (checked) return;
    if (code === 'ORIGIN_PICKUP') update('pickupLocation', '');
    if (code === 'DESTINATION_DELIVERY') update('deliveryLocation', '');
    if (code === 'EXPORT_CUSTOMS') update('exportCustomsRemark', '');
    if (code === 'IMPORT_CUSTOMS') update('importCustomsRemark', '');
  };
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/35 p-4"
      role="presentation"
    >
      <section
        aria-labelledby="quote-request-title"
        aria-modal="true"
        className="max-h-[92vh] w-full max-w-3xl overflow-y-auto rounded-lg border border-border bg-surface shadow-xl"
        role="dialog"
      >
        <div className="sticky top-0 z-10 flex items-start justify-between border-b border-border bg-surface px-5 py-4">
          <div>
            <h2 className="text-lg font-semibold" id="quote-request-title">
              获取正式报价
            </h2>
            <p className="mt-1 text-sm text-muted">
              请补充本票货物概况及所需服务，销售将基于这些信息确认正式报价。
            </p>
          </div>
          <button
            aria-label="关闭报价申请"
            className="grid size-9 place-items-center rounded border border-border"
            disabled={submitting}
            onClick={onClose}
            type="button"
          >
            <X className="size-4" />
          </button>
        </div>
        <div className="space-y-5 p-5">
          <section className="space-y-4 rounded-md border border-border p-4">
            <h3 className="text-sm font-semibold">当前运价条件</h3>
            <div className="grid gap-x-5 gap-y-4 rounded bg-sidebar/50 p-4 sm:grid-cols-2 lg:grid-cols-3">
              <QuoteFact label="航线" value={`${rate.polCode} → ${rate.podCode}`} />
              <QuoteFact label="船司" value={rate.carrierCode} />
              <QuoteFact label="服务" value={rate.serviceName || '待确认'} />
              <QuoteFact label="ETD" value={rate.etd ? formatDate(rate.etd) : '船期待确认'} />
              <QuoteFact label="有效期" value={formatDate(rate.expiryDate)} />
              <QuoteFact label="箱型" value={rate.containerType} />
            </div>
            <label className="block max-w-xs text-sm">
              <FieldLabel label="箱量" required />
              <div className="mt-2 flex items-center gap-3">
                <input
                  aria-invalid={Boolean(fieldErrors.quantity)}
                  className="h-10 w-32 rounded border border-border bg-surface px-3 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/15 aria-[invalid=true]:border-danger"
                  inputMode="numeric"
                  max={999}
                  min={1}
                  onChange={(event) => update('quantity', event.target.value)}
                  required
                  type="number"
                  value={values.quantity}
                />
                <span className="text-sm font-medium">× {rate.containerType}</span>
              </div>
              {fieldErrors.quantity ? (
                <span className="mt-1 block text-xs text-danger">{fieldErrors.quantity}</span>
              ) : null}
            </label>
          </section>
          <section className="space-y-4 rounded-md border border-border p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h3 className="text-sm font-semibold">货物概况</h3>
                <p className="mt-1 text-xs text-muted">
                  默认填写一条；如本票包含多种货物，可继续添加。
                </p>
              </div>
              <button
                className="inline-flex h-9 items-center gap-2 rounded border border-primary/30 px-3 text-sm font-semibold text-primary hover:bg-primary/5 disabled:opacity-40"
                disabled={submitting || values.cargoItems.length >= 50}
                onClick={addCargoItem}
                type="button"
              >
                <Plus aria-hidden className="size-4" /> 添加货物
              </button>
            </div>
            {fieldErrors.cargoItems ? (
              <p className="text-xs text-danger">{fieldErrors.cargoItems}</p>
            ) : null}
            <div className="space-y-4">
              {values.cargoItems.map((item, index) => (
                <article
                  className="rounded border border-border bg-sidebar/30 p-4"
                  key={item.clientId}
                >
                  <div className="mb-4 flex items-center justify-between gap-3">
                    <h4 className="text-sm font-semibold">货物 {index + 1}</h4>
                    <button
                      aria-label={`删除货物 ${index + 1}`}
                      className="inline-flex h-8 items-center gap-1.5 rounded px-2 text-xs font-medium text-danger hover:bg-danger/10 disabled:cursor-not-allowed disabled:opacity-35"
                      disabled={submitting || values.cargoItems.length === 1}
                      onClick={() => removeCargoItem(index)}
                      title={values.cargoItems.length === 1 ? '至少保留一种货物' : '删除此货物'}
                      type="button"
                    >
                      <Trash2 aria-hidden className="size-3.5" /> 删除
                    </button>
                  </div>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <QuoteRequestField
                      error={fieldErrors[`cargoItems.${index}.commodity`]}
                      label="品名"
                      required
                    >
                      <input
                        className={inputClass}
                        maxLength={500}
                        onChange={(event) =>
                          updateCargoItem(index, 'commodity', event.target.value)
                        }
                        placeholder="例如：家具、服装、机械配件"
                        value={item.commodity}
                      />
                    </QuoteRequestField>
                    <QuoteRequestField
                      error={fieldErrors[`cargoItems.${index}.estimatedGrossWeightKg`]}
                      label="预计重量（kg，选填）"
                    >
                      <input
                        className={inputClass}
                        inputMode="decimal"
                        min="0.001"
                        onChange={(event) =>
                          updateCargoItem(index, 'estimatedGrossWeightKg', event.target.value)
                        }
                        placeholder="例如：18000"
                        step="0.001"
                        type="number"
                        value={item.estimatedGrossWeightKg}
                      />
                    </QuoteRequestField>
                    <QuoteRequestField
                      error={fieldErrors[`cargoItems.${index}.cargoNature`]}
                      label="货物性质（选填）"
                    >
                      <input
                        className={inputClass}
                        maxLength={200}
                        onChange={(event) =>
                          updateCargoItem(index, 'cargoNature', event.target.value)
                        }
                        placeholder="例如：普货、易碎品"
                        value={item.cargoNature}
                      />
                    </QuoteRequestField>
                    <QuoteRequestField
                      error={fieldErrors[`cargoItems.${index}.specialRequirement`]}
                      label="特殊要求（选填）"
                    >
                      <input
                        className={inputClass}
                        maxLength={2000}
                        onChange={(event) =>
                          updateCargoItem(index, 'specialRequirement', event.target.value)
                        }
                        placeholder="例如：温控、指定操作时间"
                        value={item.specialRequirement}
                      />
                    </QuoteRequestField>
                  </div>
                </article>
              ))}
            </div>
          </section>
          <section className="space-y-4 rounded-md border border-border p-4">
            <div>
              <h3 className="text-sm font-semibold">需要附加服务</h3>
              <p className="mt-1 text-xs text-muted">按需多选；选择后可补充对应地点或备注。</p>
            </div>
            <QuoteRequestField label="Incoterm（选填）">
              <select
                className={inputClass}
                onChange={(event) =>
                  update('incoterm', event.target.value as QuoteRequestValues['incoterm'])
                }
                value={values.incoterm}
              >
                <option value="">请选择</option>
                {incotermOptions.map((incoterm) => (
                  <option key={incoterm} value={incoterm}>
                    {incoterm}
                  </option>
                ))}
              </select>
            </QuoteRequestField>
            <div className="grid gap-3 sm:grid-cols-2">
              {requestedServiceOptions.map((option) => (
                <label
                  className="flex cursor-pointer items-center gap-3 rounded border border-border px-3 py-3 text-sm hover:bg-sidebar/60"
                  key={option.code}
                >
                  <input
                    checked={values.requestedServices.includes(option.code)}
                    className="size-4 accent-primary"
                    onChange={(event) => toggleRequestedService(option.code, event.target.checked)}
                    type="checkbox"
                  />
                  <span className="font-medium">{option.label}</span>
                </label>
              ))}
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              {values.requestedServices.includes('ORIGIN_PICKUP') ? (
                <QuoteRequestField
                  error={fieldErrors.pickupLocation}
                  label="Pickup Location"
                  required
                >
                  <textarea
                    className="min-h-20 w-full rounded border border-border bg-surface p-3 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/15"
                    maxLength={1000}
                    onChange={(event) => update('pickupLocation', event.target.value)}
                    placeholder="城市 / 区域及详细提货地点"
                    value={values.pickupLocation}
                  />
                </QuoteRequestField>
              ) : null}
              {values.requestedServices.includes('DESTINATION_DELIVERY') ? (
                <QuoteRequestField
                  error={fieldErrors.deliveryLocation}
                  label="Delivery Location"
                  required
                >
                  <textarea
                    className="min-h-20 w-full rounded border border-border bg-surface p-3 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/15"
                    maxLength={1000}
                    onChange={(event) => update('deliveryLocation', event.target.value)}
                    placeholder="城市 / 区域及详细派送地点"
                    value={values.deliveryLocation}
                  />
                </QuoteRequestField>
              ) : null}
              {values.requestedServices.includes('EXPORT_CUSTOMS') ? (
                <QuoteRequestField
                  error={fieldErrors.exportCustomsRemark}
                  label="Export Customs Remark（选填）"
                >
                  <textarea
                    className="min-h-20 w-full rounded border border-border bg-surface p-3 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/15"
                    maxLength={1000}
                    onChange={(event) => update('exportCustomsRemark', event.target.value)}
                    placeholder="补充出口报关相关说明"
                    value={values.exportCustomsRemark}
                  />
                </QuoteRequestField>
              ) : null}
              {values.requestedServices.includes('IMPORT_CUSTOMS') ? (
                <QuoteRequestField
                  error={fieldErrors.importCustomsRemark}
                  label="Import Customs Remark（选填）"
                >
                  <textarea
                    className="min-h-20 w-full rounded border border-border bg-surface p-3 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/15"
                    maxLength={1000}
                    onChange={(event) => update('importCustomsRemark', event.target.value)}
                    placeholder="补充目的港清关相关说明"
                    value={values.importCustomsRemark}
                  />
                </QuoteRequestField>
              ) : null}
            </div>
          </section>
          <section className="rounded-md border border-border p-4">
            <QuoteRequestField error={fieldErrors.customerRemarks} label="Customer Remark（选填）">
              <textarea
                className="min-h-20 w-full rounded border border-border bg-surface p-3 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/15"
                maxLength={2000}
                onChange={(event) => update('customerRemarks', event.target.value)}
                placeholder="补充希望销售关注的报价说明"
                value={values.customerRemarks}
              />
            </QuoteRequestField>
          </section>
          <section className="overflow-hidden rounded-md border border-border">
            <div className="border-b border-border bg-sidebar px-4 py-3 text-sm font-semibold">
              费用预估
            </div>
            <div className="divide-y divide-border text-sm">
              <QuoteEstimateRow
                amount={validQuantity ? Number(rate.oceanSellAmount) * numericQuantity : null}
                currency={rate.currency}
                label="海运费"
                quantity={validQuantity ? numericQuantity : null}
                unitPrice={Number(rate.oceanSellAmount)}
                unitLabel={`/${rate.containerType}`}
              />
              {rate.charges.map((charge) => {
                const itemQuantity = charge.chargeBasis === 'PER_CONTAINER' ? numericQuantity : 1;
                return (
                  <QuoteEstimateRow
                    amount={validQuantity ? Number(charge.amount) * itemQuantity : null}
                    currency={charge.currency}
                    key={charge.id}
                    label={charge.chargeName}
                    quantity={validQuantity ? itemQuantity : null}
                    unitLabel={chargeUnitLabel(charge)}
                    unitPrice={Number(charge.amount)}
                  />
                );
              })}
            </div>
            <div className="flex items-center justify-between bg-primary/5 px-4 py-4">
              <span className="font-semibold">预计总额</span>
              <span className="text-lg font-bold text-primary">
                {estimate === null ? '—' : formatMoney(String(estimate), rate.currency)}
              </span>
            </div>
          </section>
          <div className="rounded-md border border-warning/25 bg-warning/10 px-4 py-3 text-sm text-foreground">
            提交后将生成“待销售确认”的报价草稿。销售可审核或调整价格；正式发送后，你才能接受、拒绝或下载正式报价
            PDF。
          </div>
          {error ? (
            <div className="rounded border border-danger/20 bg-danger/10 px-4 py-3 text-sm text-danger">
              {error}
            </div>
          ) : null}
        </div>
        <div className="flex justify-end gap-2 border-t border-border px-5 py-4">
          <button
            className="h-9 rounded border border-border px-4 text-sm font-semibold"
            disabled={submitting}
            onClick={onClose}
            type="button"
          >
            取消
          </button>
          <button
            className="h-9 rounded bg-primary px-5 text-sm font-semibold text-surface disabled:cursor-not-allowed disabled:opacity-45"
            disabled={submitting || !validQuantity}
            onClick={submit}
            type="button"
          >
            {submitting ? '提交中…' : '提交报价需求'}
          </button>
        </div>
      </section>
    </div>
  );
}

function QuoteRequestField({
  label,
  required = false,
  error,
  children,
}: {
  label: string;
  required?: boolean;
  error?: string;
  children: ReactNode;
}) {
  return (
    <label className="block text-sm">
      <FieldLabel label={label} required={required} />
      <div className="mt-2">{children}</div>
      {error ? <span className="mt-1 block text-xs text-danger">{error}</span> : null}
    </label>
  );
}

function QuoteFact({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-xs text-muted">{label}</div>
      <div className="mt-1 font-semibold">{value}</div>
    </div>
  );
}

function QuoteEstimateRow({
  label,
  quantity,
  unitPrice,
  amount,
  currency,
  unitLabel,
}: {
  label: string;
  quantity: number | null;
  unitPrice: number;
  amount: number | null;
  currency: string;
  unitLabel: string;
}) {
  return (
    <div className="grid grid-cols-[1fr_auto] items-center gap-4 px-4 py-3">
      <div>
        <div className="font-medium">{label}</div>
        <div className="mt-0.5 text-xs text-muted">
          {quantity === null
            ? '请输入有效箱量'
            : `${quantity} × ${formatMoney(String(unitPrice), currency)} ${unitLabel}`}
        </div>
      </div>
      <div className="font-semibold">
        {amount === null ? '—' : formatMoney(String(amount), currency)}
      </div>
    </div>
  );
}

function quoteEstimate(rate: CustomerRate, quantity: number) {
  return rate.charges.reduce(
    (total, charge) =>
      total + Number(charge.amount) * (charge.chargeBasis === 'PER_CONTAINER' ? quantity : 1),
    Number(rate.oceanSellAmount) * quantity,
  );
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
      <FieldLabel label={label} required={required} />
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
    const firstFieldError = error?.details?.fieldErrors
      ? Object.values(error.details.fieldErrors).flat()[0]
      : undefined;
    throw new PortalRateApiError(
      firstFieldError ?? error?.message ?? '运价查询暂时不可用，请稍后重试。',
      error?.code,
    );
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
function chargeUnitLabel(
  charge: Pick<CustomerRate['charges'][number], 'chargeBasis' | 'containerType'>,
) {
  if (charge.chargeBasis === 'PER_BL') return '/B/L';
  if (charge.chargeBasis === 'PER_SHIPMENT') return '/Shipment';
  return charge.containerType ? `/${charge.containerType}` : '/Container';
}
const inputClass =
  'h-10 w-full rounded border border-border bg-surface px-3 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/15 aria-[invalid=true]:border-danger aria-[invalid=true]:ring-2 aria-[invalid=true]:ring-danger/10';
const headerClass = 'px-4 py-3 font-semibold';
const cellClass = 'px-4 py-3 align-middle';
const pageButtonClass =
  'grid size-9 place-items-center rounded border border-border disabled:cursor-not-allowed disabled:opacity-40';
