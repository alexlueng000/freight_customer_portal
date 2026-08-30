'use client';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '@/components/auth-provider';
import { ErrorState } from '@/components/error-state';
import type { Invoice, InvoiceDocument } from '@/components/invoice-types';
import { LoadingState } from '@/components/loading-state';
import { PageHeader } from '@/components/page-header';
import { StatusBadge } from '@/components/status-badge';

export function InvoiceDetailPage({ mode }: { mode: 'admin' | 'portal' }) {
  const { id } = useParams<{ id: string }>();
  const { apiFetch } = useAuth();
  const [invoice, setInvoice] = useState<Invoice | null>(null);
  const [documents, setDocuments] = useState<InvoiceDocument[]>([]);
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [response, documentResponse] = await Promise.all([
        apiFetch(`/api/v1/${mode === 'admin' ? 'admin/' : ''}invoices/${id}`),
        apiFetch(`/api/v1/invoices/${id}/documents`),
      ]);
      const payload = (await response.json()) as Invoice & { message?: string };
      if (!response.ok) throw new Error(payload.message ?? '账单详情加载失败。');
      const documentPayload = (await documentResponse.json()) as InvoiceDocument[] & {
        message?: string;
      };
      if (!documentResponse.ok)
        throw new Error(documentPayload.message ?? '账单附件加载失败。');
      setInvoice(payload);
      setDocuments(documentPayload);
    } catch (reason) {
      setError((reason as Error).message);
    } finally {
      setLoading(false);
    }
  }, [apiFetch, id, mode]);
  useEffect(() => void load(), [load]);
  const act = async (action: string) => {
    setBusy(true);
    setError('');
    try {
      const response = await apiFetch(
        `/api/v1/${mode === 'admin' ? 'admin/' : ''}invoices/${id}/${action}`,
        { method: 'POST' },
      );
      const payload = (await response.json()) as { message?: string };
      if (!response.ok) throw new Error(payload.message ?? '操作失败。');
      await load();
    } catch (reason) {
      setError((reason as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const upload = async () => {
    if (!file) return;
    setBusy(true);
    setError('');
    try {
      const form = new FormData();
      form.append('file', file);
      const response = await apiFetch(`/api/v1/admin/invoices/${id}/documents`, {
        method: 'POST',
        body: form,
      });
      const payload = (await response.json()) as { message?: string };
      if (!response.ok) throw new Error(payload.message ?? '账单附件上传失败。');
      setFile(null);
      await load();
    } catch (reason) {
      setError((reason as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const download = async (document: InvoiceDocument) => {
    setError('');
    try {
      const response = await apiFetch(`/api/v1/documents/${document.id}/download`);
      if (!response.ok) {
        const payload = (await response.json()) as { message?: string };
        throw new Error(payload.message ?? '账单附件下载失败。');
      }
      const url = URL.createObjectURL(await response.blob());
      const anchor = window.document.createElement('a');
      anchor.href = url;
      anchor.download = document.originalFilename;
      anchor.click();
      URL.revokeObjectURL(url);
    } catch (reason) {
      setError((reason as Error).message);
    }
  };
  if (loading) return <LoadingState rows={7} />;
  if (!invoice)
    return <ErrorState description={error || '账单不存在'} onRetry={() => void load()} />;
  const actions =
    mode === 'admin' ? (
      <div className="flex gap-2">
        {invoice.status === 'DRAFT' ? (
          <>
            <button className={secondary} disabled={busy} onClick={() => void act('void')}>
              作废
            </button>
            <button className={primary} disabled={busy} onClick={() => void act('issue')}>
              发布账单
            </button>
          </>
        ) : null}
        {['ISSUED', 'CUSTOMER_CONFIRMED'].includes(invoice.status) ? (
          <>
            <button className={secondary} disabled={busy} onClick={() => void act('void')}>
              作废
            </button>
            <button className={primary} disabled={busy} onClick={() => void act('mark-paid')}>
              标记已收款
            </button>
          </>
        ) : null}
      </div>
    ) : invoice.status === 'ISSUED' ? (
      <button className={primary} disabled={busy} onClick={() => void act('confirm')}>
        确认账单
      </button>
    ) : undefined;
  return (
    <div className="space-y-5">
      <Link
        className="text-sm text-primary hover:underline"
        href={mode === 'admin' ? '/admin/invoices' : '/portal/billing'}
      >
        ← 返回账单列表
      </Link>
      <PageHeader
        eyebrow={invoice.customer.name}
        title={invoice.invoiceNo}
        description={`${invoice.shipment.shipmentNo} · ${invoice.shipment.polCode} → ${invoice.shipment.podCode}`}
        actions={actions}
      />
      {error ? (
        <div className="rounded border border-danger/20 bg-danger/10 px-4 py-3 text-sm text-danger">
          {error}
        </div>
      ) : null}
      <section className="grid gap-4 rounded border border-border bg-surface p-5 sm:grid-cols-4">
        <Fact label="状态">
          <StatusBadge>{invoice.status}</StatusBadge>
        </Fact>
        <Fact label="币种" value={invoice.currency} />
        <Fact label="到期日" value={invoice.dueDate.slice(0, 10)} />
        <Fact label="总额" value={`${invoice.currency} ${money(invoice.totalAmount)}`} />
      </section>
      <section className="overflow-hidden rounded border border-border bg-surface">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-border bg-sidebar text-xs text-muted">
              <th className={head}>费用说明</th>
              <th className={head}>费用代码</th>
              <th className={head}>数量</th>
              <th className={head}>单价</th>
              <th className={head}>金额</th>
            </tr>
          </thead>
          <tbody>
            {invoice.lines.map((line) => (
              <tr className="border-b border-border" key={line.id}>
                <td className={cell}>{line.description}</td>
                <td className={cell}>{line.chargeCode}</td>
                <td className={cell}>{line.quantity}</td>
                <td className={cell}>
                  {invoice.currency} {money(line.unitPrice)}
                </td>
                <td className={cell}>
                  {invoice.currency} {money(line.amount)}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td className="px-4 py-2 text-right" colSpan={4}>
                小计
              </td>
              <td className="px-4 py-2 font-semibold">
                {invoice.currency} {money(invoice.subtotal)}
              </td>
            </tr>
            <tr>
              <td className="px-4 py-2 text-right" colSpan={4}>
                税额
              </td>
              <td className="px-4 py-2 font-semibold">
                {invoice.currency} {money(invoice.taxAmount)}
              </td>
            </tr>
            <tr className="bg-sidebar">
              <td className="px-4 py-3 text-right font-semibold" colSpan={4}>
                合计
              </td>
              <td className="px-4 py-3 text-lg font-semibold">
                {invoice.currency} {money(invoice.totalAmount)}
              </td>
            </tr>
          </tfoot>
        </table>
      </section>
      <section className="space-y-4 rounded border border-border bg-surface p-5">
        <div>
          <h2 className="font-semibold">Invoice 附件</h2>
          <p className="mt-1 text-sm text-muted">客户仅能访问当前账单已授权的有效附件。</p>
        </div>
        {mode === 'admin' ? (
          <div className="flex flex-wrap items-center gap-3">
            <input
              accept="application/pdf,image/png,image/jpeg"
              className="text-sm"
              onChange={(event) => setFile(event.target.files?.[0] ?? null)}
              type="file"
            />
            <button className={primary} disabled={busy || !file} onClick={() => void upload()}>
              上传新版本
            </button>
          </div>
        ) : null}
        {documents.length ? (
          <div className="divide-y divide-border rounded border border-border">
            {documents.map((document) => (
              <div className="flex items-center justify-between gap-4 px-4 py-3" key={document.id}>
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold">{document.originalFilename}</p>
                  <p className="text-xs text-muted">
                    版本 {document.version} · {(document.sizeBytes / 1024).toFixed(1)} KB
                  </p>
                </div>
                <button className={secondary} onClick={() => void download(document)}>
                  下载
                </button>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted">暂无账单附件。</p>
        )}
      </section>
      <section className="grid gap-4 rounded border border-border bg-surface p-5 text-sm sm:grid-cols-4">
        <Fact label="开票时间" value={time(invoice.issuedAt)} />
        <Fact label="客户确认" value={time(invoice.confirmedAt)} />
        <Fact label="收款时间" value={time(invoice.paidAt)} />
        <Fact label="作废时间" value={time(invoice.voidedAt)} />
      </section>
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
      <div className="mt-1 font-semibold">{children ?? value}</div>
    </div>
  );
}
const money = (value: string) =>
  Number(value).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const time = (value: string | null) =>
  value ? new Date(value).toLocaleString('zh-CN', { hour12: false }) : '—';
const primary =
  'h-9 rounded bg-primary px-4 text-sm font-semibold text-surface disabled:opacity-40';
const secondary = 'h-9 rounded border border-border px-4 text-sm font-semibold disabled:opacity-40';
const head = 'px-4 py-3 font-semibold';
const cell = 'px-4 py-3';
