'use client';
import { useCallback, useEffect, useState } from 'react';
import { useAuth } from './auth-provider';
import { formatConfirmationTime } from '@/lib/booking-confirmation-time';

const labels: Record<string, string> = {
  carrierCode: '船司',
  vessel: '船名',
  voyage: '航次',
  etd: '预计开船',
  eta: '预计到港',
};
interface Difference {
  field: string;
  current: string | null;
  proposed: string | null;
}
interface Comparison {
  shipment: { status: string; updatedAt: string };
  confirmation: { id: string; soNumber: string; version: number; status: string } | null;
  differences: Difference[];
}
export function ShipmentConfirmationDifference({
  shipmentId,
  confirmationId,
}: {
  shipmentId: string;
  confirmationId?: string;
}) {
  const { apiFetch } = useAuth();
  const [comparison, setComparison] = useState<Comparison | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const load = useCallback(async () => {
    setError('');
    setComparison(null);
    setSelected([]);
    try {
      const r = await apiFetch(`/api/v1/shipments/${shipmentId}/confirmation-difference`);
      if (!r.ok) throw new Error('运输差异加载失败，请重试。');
      setComparison((await r.json()) as Comparison);
    } catch (err) {
      setError((err as Error).message);
    }
  }, [apiFetch, shipmentId]);
  useEffect(() => {
    void load();
  }, [load, confirmationId]);
  const sync = async () => {
    if (!comparison?.confirmation) return;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const r = await apiFetch(`/api/v1/shipments/${shipmentId}/sync-confirmation`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          soRecordId: comparison.confirmation.id,
          expectedUpdatedAt: comparison.shipment.updatedAt,
          fields: selected,
        }),
      });
      const data = (await r.json()) as { message?: string };
      if (!r.ok) throw new Error(data.message ?? '更新失败，请刷新后重新核对。');
      await load();
      setNotice('已更新所选计划信息并保存审计记录，实际开船和到港时间保持原记录。');
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const format = (field: string, value: string | null) =>
    field === 'etd' || field === 'eta' ? formatConfirmationTime(value) : value || '未提供';
  return (
    <div className="mt-3 border-t border-border pt-3 text-sm">
      <h3 className="font-semibold">核对订舱确认单与运输信息</h3>
      {error ? (
        <p role="alert" className="mt-2 text-danger">
          {error}{' '}
          <button onClick={() => void load()} className="underline">
            刷新核对
          </button>
        </p>
      ) : null}
      {notice ? (
        <p role="status" className="mt-2 text-success">
          {notice}
        </p>
      ) : null}
      {!comparison && !error ? <p>正在核对…</p> : null}
      {comparison ? (
        <>
          <p className="mt-2 text-muted">
            {comparison.confirmation
              ? `依据内部有效订舱确认单${comparison.confirmation.soNumber} 第 ${comparison.confirmation.version} 版（${comparison.confirmation.status === 'PUBLISHED' ? '已发布' : '尚未发布给客户'}）`
              : '暂无有效订舱确认单。'}
          </p>
          {comparison.confirmation && !comparison.differences.length ? (
            <p className="mt-2">计划信息一致。</p>
          ) : null}
          {comparison.differences.map((item) => (
            <label key={item.field} className="mt-3 flex items-start gap-2">
              <input
                type="checkbox"
                disabled={busy || comparison.shipment.status !== 'PLANNED'}
                checked={selected.includes(item.field)}
                onChange={(e) =>
                  setSelected((values) =>
                    e.target.checked
                      ? [...values, item.field]
                      : values.filter((v) => v !== item.field),
                  )
                }
              />
              <span>
                <strong>{labels[item.field]}</strong>：当前 {format(item.field, item.current)} →
                确认单 {format(item.field, item.proposed)}
                {!item.proposed ? '（选择后将清空原值）' : ''}
              </span>
            </label>
          ))}
          {comparison.differences.length ? (
            comparison.shipment.status === 'PLANNED' ? (
              <>
                <p className="mt-3 text-muted">
                  仅更新勾选字段，请先核对人工确认的信息。确认单尚未发布时，更新后的运输计划仍会在客户运输页面展示。
                </p>
                <button
                  disabled={busy || !selected.length || !!error}
                  onClick={() => void sync()}
                  className="mt-3 rounded border border-border px-3 py-2 disabled:opacity-40"
                >
                  {busy ? '更新中…' : '确认更新所选计划信息'}
                </button>
              </>
            ) : (
              <p className="mt-3 text-muted">
                当前运输已进入执行或终止阶段，仅展示差异，不自动更新。
              </p>
            )
          ) : null}
        </>
      ) : null}
    </div>
  );
}
