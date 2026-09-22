'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useAuth } from './auth-provider';
import { formatConfirmationTime } from '@/lib/booking-confirmation-time';

export interface CommissionData {
  bookingNo: string;
  quoteId?: string | null;
  polCode: string;
  podCode: string;
  carrierCode?: string | null;
  serviceName?: string | null;
  etd?: string | null;
  incoterm?: string | null;
  requestedServices?: string[];
  pickupLocationText?: string | null;
  deliveryLocationText?: string | null;
  commodity?: string | null;
  packageType?: string | null;
  packages?: number | null;
  grossWeight?: string | null;
  volumeCbm?: string | null;
  cargoReadyDate?: string | null;
  isDangerousGoods: boolean;
  specialInstructions?: string | null;
  shipperName?: string | null;
  shipperAddress?: string | null;
  bookingContactName?: string | null;
  bookingContactEmail?: string | null;
  bookingContactPhone?: string | null;
  customer?: { name: string };
  quote?: { quoteNo: string; customerTerms?: string | null } | null;
  cargoItems: Array<{
    commodity: string;
    estimatedGrossWeight?: string | null;
    cargoNature?: string | null;
    specialRequirement?: string | null;
  }>;
  containerRequests: Array<{
    containerType: string;
    quantity: number;
    weightPerContainer?: string | null;
    remark?: string | null;
  }>;
}

const serviceLabels: Record<string, string> = {
  ORIGIN_PICKUP: '起运地提货',
  EXPORT_CUSTOMS: '出口报关',
  OCEAN_FREIGHT: '海运',
  IMPORT_CUSTOMS: '目的港清关',
  DESTINATION_DELIVERY: '目的地送货',
};
const packageLabels: Record<string, string> = {
  CARTON: '纸箱',
  PALLET: '托盘',
  CRATE: '木箱',
  BAG: '袋',
  DRUM: '桶',
  PACKAGE: '件',
  OTHER: '其他',
};

export function CommissionSummary({
  data,
  internal = false,
}: {
  data: CommissionData;
  internal?: boolean;
}) {
  const facts = [
    ['航线', `${data.polCode} → ${data.podCode}`],
    ['计划船司 / 航线服务', [data.carrierCode, data.serviceName].filter(Boolean).join(' / ')],
    ['计划开船时间（未经船司确认）', formatConfirmationTime(data.etd)],
    ['货好 / 装货日期', data.cargoReadyDate?.slice(0, 10)],
    [
      '箱型箱量',
      data.containerRequests
        .map(
          (item) =>
            `${item.quantity} × ${item.containerType}${item.remark ? `，${item.remark}` : ''}`,
        )
        .join('；'),
    ],
    [
      '包装及件数',
      `${packageLabels[data.packageType ?? ''] ?? data.packageType ?? '未提供'} / ${data.packages ?? '未提供'}`,
    ],
    ['毛重 / 体积', `${data.grossWeight ?? '未提供'} 千克 / ${data.volumeCbm ?? '未提供'} 立方米`],
    ['危险品', data.isDangerousGoods ? '是，请核对危险品及特殊要求' : '否'],
    ['特殊要求', data.specialInstructions],
    ['发货人', data.shipperName],
    ['发货地址', data.shipperAddress],
    [
      '本票联系人',
      [data.bookingContactName, data.bookingContactEmail, data.bookingContactPhone]
        .filter(Boolean)
        .join(' / '),
    ],
    ['贸易条款', data.incoterm],
    [
      '客户申请服务（以报价承诺为准）',
      data.requestedServices?.map((code) => serviceLabels[code] ?? code).join('、'),
    ],
    ['提货地点', data.pickupLocationText],
    ['送货地点', data.deliveryLocationText],
  ];
  return (
    <div className="space-y-4 text-sm">
      <p>
        来源报价：
        {data.quoteId ? (
          <Link
            className="text-primary underline"
            href={`/${internal ? 'admin' : 'portal'}/quotes/${data.quoteId}`}
          >
            {data.quote?.quoteNo ?? '查看已接受报价及服务条款'}
          </Link>
        ) : (
          '未关联报价'
        )}
      </p>
      <dl className="grid gap-x-5 gap-y-3 sm:grid-cols-2">
        {facts.map(([label, value]) => (
          <div key={label} className="break-words">
            <dt className="text-muted">{label}</dt>
            <dd className="mt-1 whitespace-pre-wrap">{value || '未提供'}</dd>
          </div>
        ))}
      </dl>
      <div>
        <h3 className="font-semibold">货物明细</h3>
        {data.cargoItems.length ? (
          data.cargoItems.map((item, index) => (
            <p className="mt-2 break-words" key={index}>
              {index + 1}. {item.commodity} · {item.estimatedGrossWeight ?? '未提供'} 千克 ·{' '}
              {item.cargoNature || '货物性质未提供'}
              {item.specialRequirement ? ` · ${item.specialRequirement}` : ''}
            </p>
          ))
        ) : (
          <p>{data.commodity || '未提供'}</p>
        )}
      </div>
      {data.quote?.customerTerms ? (
        <div>
          <h3 className="font-semibold">已接受报价的客户条款</h3>
          <p className="whitespace-pre-wrap">{data.quote.customerTerms}</p>
        </div>
      ) : null}
      <p className="text-muted">
        申请服务不自动成为货代承诺。此委托用于资料核对和线下办理，不代表已经发送给船司或取得舱位。
      </p>
    </div>
  );
}

interface Submission {
  id: string;
  version: number;
  submittedByName: string;
  submittedAt: string;
  snapshot: CommissionData;
}

export function BookingCommission({
  bookingId,
  internal = false,
  revision,
}: {
  bookingId: string;
  internal?: boolean;
  revision?: string | null;
}) {
  const { apiFetch } = useAuth();
  const [rows, setRows] = useState<Submission[]>([]);
  const [selected, setSelected] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [hasMore, setHasMore] = useState(false);
  const load = useCallback(
    async (before?: number) => {
      setLoading(true);
      setError('');
      try {
        const response = await apiFetch(
          `/api/v1/${internal ? 'admin/' : ''}bookings/${encodeURIComponent(bookingId)}/submissions${before ? `?before=${before}` : ''}`,
        );
        if (!response.ok) throw new Error('委托历史加载失败，请重试。');
        const data = (await response.json()) as Submission[];
        setRows((current) => (before ? [...current, ...data] : data));
        if (!before) setSelected(data[0]?.id ?? '');
        setHasMore(data.length === 20);
      } catch (err) {
        setError((err as Error).message);
      } finally {
        setLoading(false);
      }
    },
    [apiFetch, bookingId, internal],
  );
  useEffect(() => {
    void load();
  }, [load, revision]);
  const current = rows.find((row) => row.id === selected);
  return (
    <section className="rounded border border-border bg-surface p-5">
      <h2 className="font-semibold">订舱委托及提交历史</h2>
      {error ? (
        <p role="alert" className="mt-3 text-danger">
          {error}{' '}
          <button onClick={() => void load()} className="underline">
            重试
          </button>
        </p>
      ) : loading ? (
        <p role="status">正在加载委托版本…</p>
      ) : !rows.length ? (
        <p className="mt-2 text-sm text-muted">
          未保存历史提交版本。正式提交后在此查看和打印；历史资料不会自动补造。
        </p>
      ) : null}
      {rows.length ? (
        <div className="mt-3 flex flex-wrap items-center gap-3 print:hidden">
          <label className="text-sm">
            提交版本{' '}
            <select
              className="rounded border border-border bg-surface p-2"
              value={selected}
              onChange={(e) => setSelected(e.target.value)}
            >
              {rows.map((row) => (
                <option key={row.id} value={row.id}>
                  第 {row.version} 版 · {formatConfirmationTime(row.submittedAt)}
                </option>
              ))}
            </select>
          </label>
          {hasMore ? (
            <button
              disabled={loading}
              onClick={() => void load(rows.at(-1)?.version)}
              className="text-sm text-primary underline"
            >
              加载更早版本
            </button>
          ) : null}
          <button
            disabled={!current || loading || !!error}
            className="rounded border border-border px-3 py-2 text-sm"
            onClick={() => {
              const details = document
                .getElementById('booking-commission-print')
                ?.closest('details');
              if (details) details.open = true;
              window.print();
            }}
          >
            打印 / 另存为 PDF
          </button>
        </div>
      ) : null}
      {current && !error ? (
        <details className="mt-4">
          <summary className="cursor-pointer text-sm text-primary print:hidden">
            查看委托内容
          </summary>
          <article id="booking-commission-print" className="mt-4 space-y-4">
            <h2 className="text-lg font-semibold">订舱委托单 · {current.snapshot.bookingNo}</h2>
            <p className="text-sm">
              已提交 · 第 {current.version} 版 · 提交人：{current.submittedByName}
              <br />
              提交时间：{formatConfirmationTime(current.submittedAt)}
            </p>
            <CommissionSummary data={current.snapshot} internal={internal} />
          </article>
        </details>
      ) : null}
      <style>{`@media print { body * { visibility: hidden; } #booking-commission-print, #booking-commission-print * { visibility: visible; } #booking-commission-print { position: absolute; left: 0; top: 0; width: 100%; margin: 0; padding: 20px; background: white; color: black; } #booking-commission-print a { color: black; } #booking-commission-print dl > div { break-inside: avoid; } }`}</style>
    </section>
  );
}
