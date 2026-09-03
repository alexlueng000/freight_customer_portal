'use client';
import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAuth } from '@/components/auth-provider';
import { EmptyState } from '@/components/empty-state';
import type { Invoice, InvoiceShipment } from '@/components/invoice-types';
import { LoadingState } from '@/components/loading-state';
import { PageHeader } from '@/components/page-header';
import { StatusBadge } from '@/components/status-badge';
import { hasPermission } from '@/lib/auth';

interface DraftLine {
  chargeCode: string;
  description: string;
  quantity: string;
  unitPrice: string;
}
export function InvoiceListPage({ mode }: { mode: 'admin' | 'portal' }) {
  const { apiFetch, user } = useAuth();
  const canManageInvoices = mode === 'admin' && hasPermission(user, 'invoice.manage');
  const [items, setItems] = useState<Invoice[]>([]);
  const [shipments, setShipments] = useState<InvoiceShipment[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [status, setStatus] = useState('');
  const [form, setForm] = useState({
    shipmentId: '',
    currency: 'USD',
    taxAmount: '0.00',
    dueDate: '',
  });
  const [lines, setLines] = useState<DraftLine[]>([
    { chargeCode: 'OCEAN_FREIGHT', description: 'Ocean freight', quantity: '1', unitPrice: '' },
  ]);
  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const invoiceResponse = await apiFetch(`/api/v1/${mode === 'admin' ? 'admin/' : ''}invoices`);
      const payload = (await invoiceResponse.json()) as Invoice[] & { message?: string };
      if (!invoiceResponse.ok) throw new Error(payload.message ?? '账单加载失败。');
      setItems(payload);
      if (canManageInvoices) {
        const shipmentResponse = await apiFetch('/api/v1/shipments');
        const shipmentPayload = (await shipmentResponse.json()) as InvoiceShipment[] & {
          message?: string;
        };
        if (!shipmentResponse.ok) throw new Error(shipmentPayload.message ?? 'Shipment 加载失败。');
        setShipments(shipmentPayload);
      }
    } catch (reason) {
      setError((reason as Error).message);
    } finally {
      setLoading(false);
    }
  }, [apiFetch, canManageInvoices, mode]);
  useEffect(() => void load(), [load]);
  const visible = useMemo(
    () => items.filter((item) => !status || item.status === status),
    [items, status],
  );
  const create = async () => {
    setBusy(true);
    setError('');
    try {
      const response = await apiFetch('/api/v1/admin/invoices', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ ...form, lines }),
      });
      const payload = (await response.json()) as { message?: string };
      if (!response.ok) throw new Error(payload.message ?? '账单创建失败。');
      setForm({ shipmentId: '', currency: 'USD', taxAmount: '0.00', dueDate: '' });
      setLines([
        { chargeCode: 'OCEAN_FREIGHT', description: 'Ocean freight', quantity: '1', unitPrice: '' },
      ]);
      await load();
    } catch (reason) {
      setError((reason as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow={mode === 'admin' ? '运营后台' : '客户门户'}
        title={mode === 'admin' ? '应收账单' : '账单'}
        description="按 Shipment 查看应收金额、到期日和确认/收款状态。"
      />
      {error ? (
        <div className="rounded border border-danger/20 bg-danger/10 px-4 py-3 text-sm text-danger">
          {error}
        </div>
      ) : null}
      {canManageInvoices ? (
        <section className="rounded border border-border bg-surface p-5">
          <h2 className="font-semibold">新建 Draft Invoice</h2>
          <div className="mt-4 grid gap-3 sm:grid-cols-4">
            <label className={label}>
              Shipment
              <select
                className={input}
                value={form.shipmentId}
                onChange={(e) => setForm({ ...form, shipmentId: e.target.value })}
              >
                <option value="">请选择</option>
                {shipments.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.shipmentNo} · {item.customer.name}
                  </option>
                ))}
              </select>
            </label>
            <Field
              label="币种"
              value={form.currency}
              onChange={(value) => setForm({ ...form, currency: value.toUpperCase() })}
            />
            <Field
              label="税额"
              value={form.taxAmount}
              onChange={(value) => setForm({ ...form, taxAmount: value })}
            />
            <Field
              label="到期日"
              type="date"
              value={form.dueDate}
              onChange={(value) => setForm({ ...form, dueDate: value })}
            />
          </div>
          <div className="mt-4 space-y-2">
            {lines.map((line, index) => (
              <div className="grid gap-2 sm:grid-cols-[1fr_2fr_1fr_1fr_auto]" key={index}>
                <input
                  aria-label={`费用代码 ${index + 1}`}
                  className={input}
                  placeholder="OCEAN_FREIGHT"
                  value={line.chargeCode}
                  onChange={(e) =>
                    setLines(
                      lines.map((item, i) =>
                        i === index ? { ...item, chargeCode: e.target.value.toUpperCase() } : item,
                      ),
                    )
                  }
                />
                <input
                  aria-label={`费用说明 ${index + 1}`}
                  className={input}
                  value={line.description}
                  onChange={(e) =>
                    setLines(
                      lines.map((item, i) =>
                        i === index ? { ...item, description: e.target.value } : item,
                      ),
                    )
                  }
                />
                <input
                  aria-label={`数量 ${index + 1}`}
                  className={input}
                  value={line.quantity}
                  onChange={(e) =>
                    setLines(
                      lines.map((item, i) =>
                        i === index ? { ...item, quantity: e.target.value } : item,
                      ),
                    )
                  }
                />
                <input
                  aria-label={`单价 ${index + 1}`}
                  className={input}
                  value={line.unitPrice}
                  onChange={(e) =>
                    setLines(
                      lines.map((item, i) =>
                        i === index ? { ...item, unitPrice: e.target.value } : item,
                      ),
                    )
                  }
                />
                <button
                  className={secondary}
                  disabled={lines.length === 1}
                  onClick={() => setLines(lines.filter((_, i) => i !== index))}
                >
                  删除
                </button>
              </div>
            ))}
          </div>
          <div className="mt-3 flex gap-2">
            <button
              className={secondary}
              onClick={() =>
                setLines([
                  ...lines,
                  { chargeCode: '', description: '', quantity: '1', unitPrice: '' },
                ])
              }
            >
              增加费用行
            </button>
            <button
              className={primary}
              disabled={
                busy ||
                !form.shipmentId ||
                !form.dueDate ||
                lines.some((line) => !line.chargeCode || !line.description || !line.unitPrice)
              }
              onClick={() => void create()}
            >
              创建账单
            </button>
          </div>
        </section>
      ) : null}
      <section className="overflow-hidden rounded border border-border bg-surface">
        <div className="border-b border-border p-4">
          <select className={input} value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">全部状态</option>
            {['DRAFT', 'ISSUED', 'CUSTOMER_CONFIRMED', 'PAID', 'VOID'].map((value) => (
              <option key={value}>{value}</option>
            ))}
          </select>
        </div>
        {loading ? (
          <LoadingState rows={5} />
        ) : visible.length === 0 ? (
          <div className="p-4">
            <EmptyState title="暂无账单" description="账单创建或开票后会显示在这里。" />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[850px] text-left text-sm">
              <thead>
                <tr className="border-b border-border bg-sidebar text-xs text-muted">
                  <th className={head}>账单编号</th>
                  <th className={head}>客户</th>
                  <th className={head}>Shipment</th>
                  <th className={head}>金额</th>
                  <th className={head}>到期日</th>
                  <th className={head}>状态</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((item) => (
                  <tr className="border-b border-border" key={item.id}>
                    <td className={cell}>
                      <Link
                        className="font-semibold text-primary hover:underline"
                        href={
                          mode === 'admin'
                            ? `/admin/invoices/${item.id}`
                            : `/portal/billing/${item.id}`
                        }
                      >
                        {item.invoiceNo}
                      </Link>
                    </td>
                    <td className={cell}>{item.customer.name}</td>
                    <td className={cell}>
                      {item.shipment.shipmentNo}
                      <div className="text-xs text-muted">
                        {item.shipment.polCode} → {item.shipment.podCode}
                      </div>
                    </td>
                    <td className={cell}>
                      {item.currency}{' '}
                      {Number(item.totalAmount).toLocaleString(undefined, {
                        minimumFractionDigits: 2,
                      })}
                    </td>
                    <td className={cell}>{item.dueDate.slice(0, 10)}</td>
                    <td className={cell}>
                      <StatusBadge>{item.status}</StatusBadge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
function Field({
  label: text,
  value,
  onChange,
  type = 'text',
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
}) {
  return (
    <label className={label}>
      {text}
      <input
        className={input}
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </label>
  );
}
const label = 'text-sm font-medium';
const input = 'mt-1 h-9 w-full rounded border border-border bg-surface px-3 text-sm';
const primary =
  'h-9 rounded bg-primary px-4 text-sm font-semibold text-surface disabled:opacity-40';
const secondary = 'h-9 rounded border border-border px-3 text-sm font-semibold disabled:opacity-40';
const head = 'px-4 py-3 font-semibold';
const cell = 'px-4 py-3 align-middle';
