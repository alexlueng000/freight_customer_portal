'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { useAuth } from '@/components/auth-provider';
import { EmptyState } from '@/components/empty-state';
import { ErrorState, PermissionDeniedState } from '@/components/error-state';
import { LoadingState } from '@/components/loading-state';
import { PageHeader } from '@/components/page-header';
import { QuoteRequestForm, type QuoteRequestValues } from '@/components/quote-request-form';
import { hasPermission } from '@/lib/auth';
import type { CustomerRate } from '@/lib/customer-rate';

export function QuoteRequestPage({ rateId, containerType, etdFrom, etdTo }: {
  rateId: string; containerType: string; etdFrom?: string; etdTo?: string;
}) {
  const { apiFetch, user } = useAuth();
  const router = useRouter();
  const allowed = hasPermission(user, 'rate.search') && hasPermission(user, 'quote.create');
  const [rate, setRate] = useState<CustomerRate | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [forbidden, setForbidden] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const submittingRef = useRef(false);
  const [error, setError] = useState('');
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!allowed) return;
    const controller = new AbortController();
    setLoading(true);
    setFailed(false);
    setForbidden(false);
    setRate(null);
    if (!containerType) { setLoading(false); return; }
    const query = new URLSearchParams({ rateId, containerType, page: '1', pageSize: '1' });
    if (etdFrom) query.set('etdFrom', etdFrom);
    if (etdTo) query.set('etdTo', etdTo);
    void apiFetch(`/api/v1/portal/rates?${query}`, { signal: controller.signal })
      .then(async (response) => {
        if (response.status === 403) { if (!controller.signal.aborted) setForbidden(true); return; }
        if (!response.ok) throw new Error('Rate load failed');
        const data = await response.json() as { items: CustomerRate[] };
        if (!controller.signal.aborted) setRate(data.items.find((item) => item.id === rateId && item.containerType === containerType) ?? null);
      })
      .catch(() => { if (!controller.signal.aborted) setFailed(true); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [allowed, apiFetch, rateId, containerType, etdFrom, etdTo, attempt]);

  const submit = async (values: QuoteRequestValues) => {
    if (!rate || submittingRef.current) return;
    submittingRef.current = true;
    setSubmitting(true);
    setError('');
    setFieldErrors({});
    let navigating = false;
    try {
      const response = await apiFetch('/api/v1/quotes', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          rateId: rate.id, containerType: rate.containerType, containerQuantity: Number(values.quantity),
          factoryLoadingDate: values.factoryLoadingDate || undefined,
          cargoItems: values.cargoItems.map((item) => ({
            commodity: item.commodity.trim(),
            ...(item.estimatedGrossWeightKg.trim() ? { estimatedGrossWeight: Number(item.estimatedGrossWeightKg) } : {}),
            cargoNature: item.cargoNature.trim() || undefined, specialRequirement: item.specialRequirement.trim() || undefined,
          })),
          pickupLocationText: values.pickupLocation.trim() || undefined,
          deliveryLocationText: values.deliveryLocation.trim() || undefined,
          exportCustomsRemark: values.exportCustomsRemark.trim() || undefined,
          importCustomsRemark: values.importCustomsRemark.trim() || undefined,
          customerRemarks: values.customerRemarks.trim() || undefined, requestedServices: values.requestedServices,
        }),
      });
      const payload = await response.json() as { id?: string; message?: string; details?: { fieldErrors?: Record<string, string[]> } };
      if (!response.ok) {
        const names: Record<string, string> = { containerQuantity: 'quantity', pickupLocationText: 'pickupLocation', deliveryLocationText: 'deliveryLocation' };
        setFieldErrors(Object.fromEntries(Object.entries(payload.details?.fieldErrors ?? {}).map(
          ([key, messages]) => [names[key] ?? key, (messages[0] ?? '请检查此项。').replace(/^[A-Za-z0-9_.[\]]+\s+/, '')],
        )));
        setError(payload.details?.fieldErrors ? '请检查标出的字段后重新提交。' : payload.message ?? '报价申请提交失败，请重试。');
        return;
      }
      if (!payload.id) throw new Error('Missing quote ID');
      router.replace(`/portal/quotes/${encodeURIComponent(payload.id)}`);
      navigating = true;
    } catch {
      setError('报价申请提交失败，请检查网络后重试。填写的内容已保留。');
    } finally {
      // Keep the completed request locked until navigation unmounts this form.
      if (!navigating) {
        submittingRef.current = false;
        setSubmitting(false);
      }
    }
  };

  return <div className="mx-auto max-w-4xl space-y-5">
    <Link className="inline-block text-sm font-medium text-primary underline-offset-4 hover:underline" href="/portal/rates">← 返回查运价</Link>
    <PageHeader eyebrow="客户门户 / 报价申请" title="获取正式报价" description="请补充本票货物概况及所需服务，销售将据此确认正式报价。" />
    {!allowed || forbidden ? <PermissionDeniedState /> : loading ? <LoadingState /> : failed ?
      <ErrorState description="运价加载失败，请重试。" onRetry={() => setAttempt((value) => value + 1)} /> : !rate ?
      <EmptyState title="该运价暂不可用" description="运价可能已过期、停用或不支持所选箱型，请返回查运价重新选择。" /> :
      <QuoteRequestForm key={`${rate.id}-${rate.containerType}`} rate={rate} error={error} serverFieldErrors={fieldErrors}
        submitting={submitting} onClose={() => router.push('/portal/rates')} onSubmit={(values) => void submit(values)} />}
  </div>;
}
