'use client';

import { Plus, Trash2 } from 'lucide-react';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { z } from 'zod';
import { FieldLabel } from '@/components/required-mark';
import { rateSailingLabel } from '@/lib/rate-sailing';
import type { CustomerRate } from '@/lib/customer-rate';
import styles from './quote-request-form.module.css';

const requestedServiceOptions = [
  { code: 'ORIGIN_PICKUP', label: '起运地拖车 / 提货' },
  { code: 'EXPORT_CUSTOMS', label: '出口报关' },
  { code: 'IMPORT_CUSTOMS', label: '目的港清关' },
  { code: 'DESTINATION_DELIVERY', label: '目的地派送' },
] as const;
type RequestedServiceCode = (typeof requestedServiceOptions)[number]['code'];
export interface QuoteRequestValues {
  quantity: string;
  factoryLoadingDate: string;
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
  requestedServices: RequestedServiceCode[];
}
let nextCargoItemId = 1;
function isCalendarDate(value: string) {
  if (!/^(?!0000)\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}
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
  factoryLoadingDate: z.string().refine((value) => {
    return !value || isCalendarDate(value);
  }, '请选择有效的工厂预计装货日期。'),
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
  pickupLocation: z.string().trim().min(1, '请填写提货地点。').max(1000, '提货地点不能超过 1000 字。'),
  deliveryLocation: z.string().trim().min(1, '请填写派送地点。').max(1000, '派送地点不能超过 1000 字。'),
  exportCustomsRemark: z.string().trim().max(1000, '出口报关备注不能超过 1000 字。'),
  importCustomsRemark: z.string().trim().max(1000, '进口清关备注不能超过 1000 字。'),
  customerRemarks: z.string().trim().max(2000, '客户备注不能超过 2000 字。'),
  requestedServices: z.array(
    z.enum(['ORIGIN_PICKUP', 'EXPORT_CUSTOMS', 'IMPORT_CUSTOMS', 'DESTINATION_DELIVERY']),
  ),
  });
export function QuoteRequestForm({
  serverFieldErrors,
  rate,
  error,
  submitting,
  onClose,
  onSubmit,
}: {
  serverFieldErrors: Record<string, string>;
  rate: CustomerRate;
  error: string;
  submitting: boolean;
  onClose: () => void;
  onSubmit: (values: QuoteRequestValues) => void;
}) {
  const [values, setValues] = useState<QuoteRequestValues>({
    quantity: '1',
    factoryLoadingDate: '',
    cargoItems: [newCargoItem()],
    pickupLocation: '',
    deliveryLocation: '',
    exportCustomsRemark: '',
    importCustomsRemark: '',
    customerRemarks: '',
    requestedServices: [],
  });
  const [localFieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const formRef = useRef<HTMLElement>(null);
  const [validationAttempt, setValidationAttempt] = useState(0);
  useEffect(() => {
    if (!validationAttempt && !Object.keys(serverFieldErrors).length) return;
    // Wait for inline errors to render, then follow the visual field order.
    const frame = requestAnimationFrame(() => {
      const input = formRef.current?.querySelector<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>(
        'input[aria-invalid="true"], textarea[aria-invalid="true"], select[aria-invalid="true"], [data-field-error="true"] input, [data-field-error="true"] textarea, [data-field-error="true"] select',
      );
      if (!input) return;
      input.focus({ preventScroll: true });
      (input.closest('label') ?? input).scrollIntoView({
        block: 'center',
        behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth',
      });
    });
    return () => cancelAnimationFrame(frame);
  }, [validationAttempt, serverFieldErrors]);
  const [pendingRequest, setPendingRequest] = useState<QuoteRequestValues | null>(null);
  const confirmationRef = useRef<HTMLDialogElement>(null);
  const confirmedRef = useRef(false);
  useEffect(() => {
    const dialog = confirmationRef.current;
    if (!dialog) return;
    if (pendingRequest && !dialog.open) {
      confirmedRef.current = false;
      dialog.showModal();
    } else if (!pendingRequest && dialog.open) {
      dialog.close();
    }
  }, [pendingRequest]);
  const fieldErrors = { ...serverFieldErrors, ...localFieldErrors };
  const departureDate = rate.etd?.slice(0, 10);
  const loadingAfterDeparture = Boolean(
    departureDate && isCalendarDate(departureDate) && isCalendarDate(values.factoryLoadingDate)
      && values.factoryLoadingDate > departureDate,
  );
  const numericQuantity = Number(values.quantity);
  const validQuantity =
    Number.isInteger(numericQuantity) && numericQuantity >= 1 && numericQuantity <= 999;
  const estimate = validQuantity ? quoteEstimate(rate, numericQuantity) : null;
  const submit = () => {
    if (submitting || pendingRequest) return;
    const result = quoteRequestSchema.safeParse(values);
    if (!result.success) {
      setFieldErrors(
        Object.fromEntries(
          result.error.issues.map((issue) => [issue.path.join('.'), issue.message]),
        ),
      );
      setValidationAttempt((attempt) => attempt + 1);
      return;
    }
    setFieldErrors({});
    setPendingRequest(result.data);
  };
  const confirmSubmit = () => {
    if (!pendingRequest || submitting || confirmedRef.current) return;
    confirmedRef.current = true;
    const request = pendingRequest;
    setPendingRequest(null);
    onSubmit(request);
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
    if (code === 'EXPORT_CUSTOMS') update('exportCustomsRemark', '');
    if (code === 'IMPORT_CUSTOMS') update('importCustomsRemark', '');
  };
  return (
    <section ref={formRef} aria-label="报价申请" className="space-y-8">
        <div className="space-y-8 sm:space-y-10">
          <RequestSection number="01" title="当前运价条件" description="核对所选运价的航线、船期、箱型与有效期。" tone="route">
            <div className="grid gap-x-6 gap-y-5 sm:grid-cols-2 lg:grid-cols-3">
              <QuoteFact label="航线" value={`${rate.polDisplayName || rate.polName || rate.polCode} → ${rate.podDisplayName || rate.podName || rate.podCode}`} />
              <QuoteFact label="港口代码" value={`${rate.polCode} → ${rate.podCode}`} />
              <QuoteFact label="船司" value={rate.carrierCode} />
              <QuoteFact label="航线服务" value={rate.serviceName || '待确认'} />
              <QuoteFact label="开船日" value={rateSailingLabel(rate)} />
              <QuoteFact label="有效期" value={`${formatDate(rate.effectiveDate)} 至 ${formatDate(rate.expiryDate)}`} />
              <QuoteFact label="箱型" value={rate.containerType} />
            </div>
          </RequestSection>
          <RequestSection number="02" title="货物概况" description="填写箱量、装货计划及提派地点，并补充本票货物信息。" tone="cargo" action={
              <button
                className="inline-flex h-9 items-center gap-2 rounded border border-primary/30 px-3 text-sm font-semibold text-primary hover:bg-primary/5 disabled:opacity-40"
                disabled={submitting || values.cargoItems.length >= 50}
                onClick={addCargoItem}
                type="button"
              >
                <Plus aria-hidden className="size-4" /> 添加货物
              </button>
          }>
            <div className="grid gap-4 sm:grid-cols-2">
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
            <QuoteRequestField label="工厂预计装货日期（选填）" error={fieldErrors.factoryLoadingDate} errorId="factory-loading-date-error">
              <input
                type="date"
                aria-invalid={Boolean(fieldErrors.factoryLoadingDate)}
                aria-describedby={['factory-loading-date-hint', fieldErrors.factoryLoadingDate && 'factory-loading-date-error', loadingAfterDeparture && 'factory-loading-date-warning'].filter(Boolean).join(' ')}
                className="h-10 w-full rounded border border-border bg-surface px-3 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/15 aria-[invalid=true]:border-danger"
                value={values.factoryLoadingDate}
                onChange={(event) => update('factoryLoadingDate', event.target.value)}
              />
              <span id="factory-loading-date-hint" className="mt-1 block text-xs text-muted">工厂计划装货的日期，与船舶开船日分别填写。</span>
              {loadingAfterDeparture ? (
                <span id="factory-loading-date-warning" role="status" className="mt-2 block rounded border border-warning/30 bg-warning/10 p-3 text-sm text-foreground">
                  预计装货日期晚于本航次开船日（{departureDate}），可能赶不上这班船。请核对装货日期或重新选择船期，也可继续提交，由销售确认后续船期及运价。
                </span>
              ) : null}
            </QuoteRequestField>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
                <QuoteRequestField
                  error={fieldErrors.pickupLocation}
                  errorId="pickup-location-error"
                  label="提货地点"
                  required
                >
                  <textarea
                    required
                    aria-invalid={Boolean(fieldErrors.pickupLocation)}
                    aria-describedby={fieldErrors.pickupLocation ? 'pickup-location-error' : undefined}
                    className="min-h-20 w-full rounded border border-border bg-surface p-3 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/15"
                    maxLength={1000}
                    onChange={(event) => update('pickupLocation', event.target.value)}
                    placeholder="城市 / 区域及详细提货地点"
                    value={values.pickupLocation}
                  />
                </QuoteRequestField>
                <QuoteRequestField
                  error={fieldErrors.deliveryLocation}
                  errorId="delivery-location-error"
                  label="派送地点"
                  required
                >
                  <textarea
                    required
                    aria-invalid={Boolean(fieldErrors.deliveryLocation)}
                    aria-describedby={fieldErrors.deliveryLocation ? 'delivery-location-error' : undefined}
                    className="min-h-20 w-full rounded border border-border bg-surface p-3 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/15"
                    maxLength={1000}
                    onChange={(event) => update('deliveryLocation', event.target.value)}
                    placeholder="城市 / 区域及详细派送地点"
                    value={values.deliveryLocation}
                  />
                </QuoteRequestField>
            </div>
            {fieldErrors.cargoItems ? (
              <p className="text-xs text-danger">{fieldErrors.cargoItems}</p>
            ) : null}
            <div className="divide-y divide-border border-t border-border">
              {values.cargoItems.map((item, index) => (
                <article
                  className="py-5 last:pb-0"
                  key={item.clientId}
                >
                  <div className="mb-4 flex items-center justify-between gap-3">
                    <h3 className="text-sm font-semibold text-[oklch(0.40_0.08_175)]">货物 {index + 1}</h3>
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
          </RequestSection>
          <RequestSection number="03" title="需要附加服务" description="按需多选，相关费用由销售确认后列入正式报价。" tone="services">

            <div className="grid gap-3 sm:grid-cols-2">
              {requestedServiceOptions.map((option) => (
                <label
                  className={`${styles.serviceOption} ${values.requestedServices.includes(option.code) ? styles.serviceSelected : ''}`}
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
              {values.requestedServices.includes('EXPORT_CUSTOMS') ? (
                <QuoteRequestField
                  error={fieldErrors.exportCustomsRemark}
                  label="出口报关备注（选填）"
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
                  label="目的港清关备注（选填）"
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
          </RequestSection>
          <RequestSection number="04" title="补充信息" description="选填：已有合同约定或其他要求可在此说明。" tone="notes">
            <QuoteRequestField error={fieldErrors.customerRemarks} label="报价备注（选填）">
              <textarea
                className="min-h-20 w-full rounded border border-border bg-surface p-3 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/15"
                maxLength={2000}
                onChange={(event) => update('customerRemarks', event.target.value)}
                placeholder="补充希望销售关注的报价说明"
                value={values.customerRemarks}
              />
            </QuoteRequestField>
          </RequestSection>
          <RequestSection number="05" title="费用预估" description="核对已知费用，最终金额及服务范围以正式报价为准。" tone="fees">
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
            {values.requestedServices.length > 0 ? (
              <div aria-live="polite" className="border-t border-border px-4 py-3">
                <h4 className="text-sm font-semibold">待确认的服务费用</h4>
                <p className="mt-1 text-xs text-muted">
                  以下服务尚未计价，未计入已知费用小计；销售将核对现有费用是否已包含，避免重复收费。
                </p>
                <ul className="mt-3 divide-y divide-border">
                  {requestedServiceOptions.filter((option) => values.requestedServices.includes(option.code)).map((option) => {
                    const location = option.code === 'ORIGIN_PICKUP'
                      ? values.pickupLocation.trim()
                      : option.code === 'DESTINATION_DELIVERY' ? values.deliveryLocation.trim() : '';
                    return (
                      <li className="flex items-start justify-between gap-4 py-2 text-sm" key={option.code}>
                        <div className="min-w-0">
                          <span>{option.label}</span>
                          {location ? <p className="mt-1 whitespace-pre-wrap break-words text-xs text-muted">{location}</p> : null}
                        </div>
                        <span className="shrink-0 font-medium">待销售报价</span>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ) : null}
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-[oklch(0.95_0.03_85)] px-4 py-5">
              <span className="font-semibold">已知费用小计</span>
              <span className="text-lg font-bold text-primary">
                {estimate === null ? '—' : formatMoney(String(estimate), rate.currency)}
              </span>
            </div>
            <div className="space-y-2 border-t border-border px-4 py-3 text-sm">
              <div className="flex items-center justify-between gap-4 font-semibold">
                <span>全部费用</span>
                <span>待销售确认</span>
              </div>
              <p className="text-xs text-muted">
                {values.requestedServices.length > 0
                  ? '上方小计仅包含已列明金额，所选服务费用待确认，最终金额以正式报价为准。'
                  : '上方小计为当前运价参考金额，最终费用及包含范围以正式报价为准。'}
              </p>
            </div>
          </RequestSection>
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
        <div className="flex flex-wrap justify-end gap-3 border-t border-border pt-6">
          <button
            className="h-9 rounded border border-border px-4 text-sm font-semibold"
            disabled={submitting}
            onClick={onClose}
            type="button"
          >
            返回查运价
          </button>
          <button
            className="h-9 rounded bg-primary px-5 text-sm font-semibold text-surface disabled:cursor-not-allowed disabled:opacity-45"
            disabled={submitting}
            onClick={submit}
            type="button"
          >
            {submitting ? '提交中…' : '提交报价需求'}
          </button>
        </div>
      <dialog
        ref={confirmationRef}
        aria-labelledby="quote-submit-confirm-title"
        aria-describedby="quote-submit-confirm-description"
        onCancel={() => setPendingRequest(null)}
        onClose={() => setPendingRequest(null)}
        // Override the parent space-y margins and the browser's dialog insets.
        style={{ position: 'fixed', inset: '50% auto auto 50%', margin: 0, transform: 'translate(-50%, -50%)' }}
        className="max-h-[85dvh] w-[calc(100%-2rem)] max-w-lg overflow-y-auto rounded-xl border border-border bg-surface p-0 text-foreground shadow-xl backdrop:bg-foreground/40"
      >
        <div className="border-b border-border bg-primary/5 px-5 py-4">
          <h2 id="quote-submit-confirm-title" className="text-lg font-semibold">确认提交报价申请</h2>
          <p id="quote-submit-confirm-description" className="mt-2 text-sm leading-6 text-muted">
            提交后由销售核对价格和服务范围，确认后向你发送正式报价。本次提交不会直接订舱。
          </p>
        </div>
        {pendingRequest ? <dl className="grid grid-cols-1 gap-4 p-5 text-sm sm:grid-cols-2">
          {[
            ['航线', `${rate.polDisplayName || rate.polName || rate.polCode} → ${rate.podDisplayName || rate.podName || rate.podCode}`],
            ['箱型 / 箱量', `${pendingRequest.quantity} × ${rate.containerType}`],
            ['开船日', rateSailingLabel(rate)],
            ['工厂预计装货日期', pendingRequest.factoryLoadingDate || '未填写'],
            ['提货地点', pendingRequest.pickupLocation],
            ['派送地点', pendingRequest.deliveryLocation],
            ['货物品名', pendingRequest.cargoItems.map((item) => item.commodity).join('、')],
            ['附加服务', requestedServiceOptions.filter((item) => pendingRequest.requestedServices.includes(item.code)).map((item) => item.label).join('、') || '未选择'],
          ].map(([label, value]) => <div key={label} className="min-w-0">
            <dt className="text-xs text-muted">{label}</dt>
            <dd className="mt-1 whitespace-pre-wrap break-words font-medium">{value}</dd>
          </div>)}
        </dl> : null}
        {loadingAfterDeparture ? <p className="mx-5 mb-5 rounded border border-warning/30 bg-warning/10 p-3 text-sm">
          预计装货日期晚于本航次开船日，可能赶不上这班船。继续提交后需由销售确认后续船期及运价。
        </p> : null}
        <div className="flex flex-wrap justify-end gap-3 border-t border-border px-5 py-4">
          <button type="button" autoFocus onClick={() => setPendingRequest(null)} className="h-10 rounded border border-border px-4 text-sm font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary">返回修改</button>
          <button type="button" disabled={submitting} onClick={confirmSubmit} className="h-10 rounded bg-primary px-5 text-sm font-semibold text-surface disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary focus-visible:outline-offset-2">确认提交</button>
        </div>
      </dialog>
    </section>
  );
}

function RequestSection({ number, title, description, tone, action, children }: {
  number: string;
  title: string;
  description: string;
  tone: 'route' | 'cargo' | 'services' | 'notes' | 'fees';
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section aria-label={title} className={styles.section} data-tone={tone}>
      <header className={styles.sectionHeader}>
        <div className="flex min-w-0 flex-1 items-start gap-3 sm:gap-4">
          <span aria-hidden="true" className={styles.sectionNumber}>{number}</span>
          <div className="min-w-0">
            <h2 className={styles.sectionTitle}>{title}</h2>
            <p className="mt-1 text-sm leading-6 text-muted">{description}</p>
          </div>
        </div>
        {action ? <div className="shrink-0">{action}</div> : null}
      </header>
      <div className="space-y-6 p-4 sm:p-6">{children}</div>
    </section>
  );
}

function QuoteRequestField({
  label,
  required = false,
  error,
  errorId,
  children,
}: {
  label: string;
  required?: boolean;
  error?: string;
  errorId?: string;
  children: ReactNode;
}) {
  return (
    <label data-field-error={Boolean(error)} className="block scroll-mt-24 text-sm [&[data-field-error=true]_input]:border-danger [&[data-field-error=true]_textarea]:border-danger [&[data-field-error=true]_select]:border-danger">
      <FieldLabel label={label} required={required} />
      <div className="mt-2">{children}</div>
      {error ? <span id={errorId} role="alert" className="mt-1 block text-xs text-danger">{error}</span> : null}
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
  if (charge.chargeBasis === 'PER_SHIPMENT') return '/票';
  return charge.containerType ? `/${charge.containerType}` : '/箱';
}

const inputClass = "h-10 w-full rounded border border-border bg-surface px-3 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/15 aria-[invalid=true]:border-danger";
