'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { ChevronDown, ChevronLeft, ChevronRight, Download, Pencil, Plus, Trash2, Upload, X } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { FieldPath, UseFormSetError } from 'react-hook-form';
import { useFieldArray, useForm } from 'react-hook-form';
import { z } from 'zod';
import { useAuth } from '@/components/auth-provider';
import { hasPermission } from '@/lib/auth';
import { DataTable, type DataTableColumn } from '@/components/data-table';
import { DeleteRateDialog } from '@/components/delete-rate-dialog';
import { EmptyState } from '@/components/empty-state';
import { ErrorState, PermissionDeniedState } from '@/components/error-state';
import { FilterBar } from '@/components/filter-bar';
import { LoadingState } from '@/components/loading-state';
import { PageHeader } from '@/components/page-header';
import { FieldLabel, RequiredLegend } from '@/components/required-mark';
import { StatusBadge } from '@/components/status-badge';

type RateStatus = 'DRAFT' | 'ACTIVE' | 'EXPIRED' | 'INACTIVE';
type ChargeBasis = 'PER_CONTAINER' | 'PER_BL' | 'PER_SHIPMENT';
interface RatePrice { id: string; containerType: string; costAmount: string; sellAmount: string | null; currency: string; remark: string | null }
interface RateCharge { id: string; chargeCode: string; chargeName: string; chargeBasis: ChargeBasis; containerType: string | null; amount: string; currency: string; isIncluded: boolean }
interface Rate {
  _count?: { quotes: number };
  id: string; rateNo: string; polCode: string; polName: string; podCode: string; podName: string;
  carrierCode: string; serviceName: string | null; effectiveDate: string; expiryDate: string;
  etd: string | null; transitDays: number | null; supplierName: string | null; contractNo: string | null;
  currency: string; status: RateStatus; prices: RatePrice[]; charges: RateCharge[]; updatedAt: string;
}
interface RateListResponse { items: Rate[]; pagination: { page: number; pageSize: number; total: number; totalPages: number } }
interface RateImport { id: string; originalFileName: string; status: 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED'; totalRows: number; successRows: number; failedRows: number; errors: Array<{ row: number; field: string; message: string }> | null; errorMessage: string | null; createdAt: string }
interface RateImportHeaderCandidate { row: number; depth: 1 | 2; score: number; labels: string[]; suggestions: Array<{ column: number; sourceLabel: string; targetField: string; confidence: 'HIGH' | 'MEDIUM' }> }
interface RateImportAnalysis { fileName: string; sheets: Array<{ index: number; name: string; rowCount: number; columnCount: number; mergedCellRanges: number; headerCandidates: RateImportHeaderCandidate[]; sampleRows: Array<{ row: number; values: string[] }> }> }
interface RateImportPreview { previewToken: string; expiresAt: string; summary: { rateCount: number; priceCount: number; chargeCount: number; errorCount: number; warningCount: number }; rates: Array<{ source: { sheet: string; row: number }; rateNo?: string; polCode?: string; polName?: string; podCode?: string; podName?: string; carrierCode?: string; effectiveDate?: string; expiryDate?: string; currency?: string; status: string; prices: Array<{ containerType: string; costAmount?: string; sellAmount?: string; currency: string }>; charges?: Array<{ chargeCode: string; chargeName: string; chargeBasis: ChargeBasis; containerType?: string; amount: string; currency: string }> }>; issues: Array<{ severity: 'ERROR' | 'WARNING'; code: string; message: string; source: { sheet: string; row: number; column?: number; field?: string } }>; truncated: boolean }
interface ImportFixDefaults { effectiveDate: string; expiryDate: string; currency: string }
interface ApiErrorPayload { code?: string; message?: string; details?: { errors?: string[]; fieldErrors?: Record<string, string[]> } }
class RateApiError extends Error { constructor(message: string, readonly code?: string, readonly details?: ApiErrorPayload['details']) { super(message); } }

const decimal = z.string().trim().regex(/^\d{1,14}(?:\.\d{1,4})?$/, '请输入非负金额，最多 4 位小数');
const optionalDecimal = z.string().trim().refine((value) => !value || /^\d{1,14}(?:\.\d{1,4})?$/.test(value), '请输入非负金额，最多 4 位小数');
const rateFormSchema = z.object({
  rateNo: z.string().trim().min(1, '运价编号为必填项').max(50).regex(/^[A-Za-z0-9][A-Za-z0-9_-]*$/, '仅支持字母、数字、下划线和连字符'),
  polCode: z.string().trim().min(3, '请输入起运港代码').max(10).regex(/^[A-Za-z0-9]+$/, '仅支持字母和数字'),
  polName: z.string().trim().min(1, '起运港名称为必填项').max(150),
  podCode: z.string().trim().min(3, '请输入目的港代码').max(10).regex(/^[A-Za-z0-9]+$/, '仅支持字母和数字'),
  podName: z.string().trim().min(1, '目的港名称为必填项').max(150),
  carrierCode: z.string().trim().min(2, '船司代码为必填项').max(20).regex(/^[A-Za-z0-9]+$/, '仅支持字母和数字'),
  serviceName: z.string().trim().max(150), effectiveDate: z.string().min(1, '生效日为必填项'), expiryDate: z.string().min(1, '失效日为必填项'),
  etd: z.string(), transitDays: z.string().trim().refine((value) => !value || (/^\d+$/.test(value) && Number(value) <= 365), '请输入 0–365 的整数'),
  supplierName: z.string().trim().max(200), contractNo: z.string().trim().max(100),
  currency: z.string().trim().regex(/^[A-Za-z]{3}$/, '请输入三位币种代码'), status: z.enum(['DRAFT', 'ACTIVE', 'EXPIRED', 'INACTIVE']),
  prices: z.array(z.object({ containerType: z.string().min(1, '请选择箱型'), costAmount: decimal, sellAmount: optionalDecimal, currency: z.string().regex(/^[A-Za-z]{3}$/, '三位币种代码'), remark: z.string().max(500) })).min(1, '至少添加一个箱型价格'),
  charges: z.array(z.object({ chargeCode: z.string().trim().min(1, '费用代码为必填项').max(30).regex(/^[A-Za-z0-9_-]+$/, '费用代码格式不正确'), chargeName: z.string().trim().min(1, '费用名称为必填项').max(150), chargeBasis: z.enum(['PER_CONTAINER', 'PER_BL', 'PER_SHIPMENT']), containerType: z.string(), amount: decimal, currency: z.string().regex(/^[A-Za-z]{3}$/, '三位币种代码'), isIncluded: z.boolean() })),
}).superRefine((value, context) => {
  if (value.effectiveDate && value.expiryDate && value.effectiveDate > value.expiryDate) context.addIssue({ code: z.ZodIssueCode.custom, path: ['expiryDate'], message: '失效日不能早于生效日' });
  const types = value.prices.map((price) => price.containerType);
  if (new Set(types).size !== types.length) context.addIssue({ code: z.ZodIssueCode.custom, path: ['prices'], message: '同一箱型只能添加一次' });
  value.charges.forEach((charge, index) => {
    if (charge.chargeBasis === 'PER_CONTAINER' && !charge.containerType) context.addIssue({ code: z.ZodIssueCode.custom, path: ['charges', index, 'containerType'], message: '按箱费用必须选择箱型' });
  });
});
type RateFormValues = z.infer<typeof rateFormSchema>;

const statusLabels: Record<RateStatus, string> = { DRAFT: '草稿', ACTIVE: '启用', EXPIRED: '已过期', INACTIVE: '停用' };
const statusTones = { DRAFT: 'neutral', ACTIVE: 'success', EXPIRED: 'warning', INACTIVE: 'neutral' } as const;
const basisLabels: Record<ChargeBasis, string> = { PER_CONTAINER: '按箱', PER_BL: '按提单', PER_SHIPMENT: '按票' };
const containerTypes = ['20GP', '40GP', '40HQ', '45HQ'];
const currencyOptions = ['USD', 'CNY', 'EUR', 'HKD', 'JPY'];
const commonPorts = [
  { code: 'CNSHA', name: 'Shanghai' },
  { code: 'CNNGB', name: 'Ningbo' },
  { code: 'CNSZX', name: 'Shenzhen' },
  { code: 'CNQIN', name: 'Qingdao' },
  { code: 'USLAX', name: 'Los Angeles' },
  { code: 'USLGB', name: 'Long Beach' },
  { code: 'USNYC', name: 'New York' },
  { code: 'DEHAM', name: 'Hamburg' },
  { code: 'NLRTM', name: 'Rotterdam' },
  { code: 'GBFXT', name: 'Felixstowe' },
];
const carrierOptions = [
  { code: 'COSCO', name: 'COSCO Shipping' },
  { code: 'MAEU', name: 'Maersk' },
  { code: 'MSCU', name: 'MSC' },
  { code: 'CMDU', name: 'CMA CGM' },
  { code: 'ONEY', name: 'Ocean Network Express' },
  { code: 'HLCU', name: 'Hapag-Lloyd' },
  { code: 'EGLV', name: 'Evergreen' },
  { code: 'YMLU', name: 'Yang Ming' },
];
const chargeOptions = [
  { code: 'THC', name: 'Terminal Handling Charge' },
  { code: 'DOC', name: 'Documentation Fee' },
  { code: 'SEAL', name: 'Seal Fee' },
  { code: 'AMS', name: 'AMS Filing Fee' },
  { code: 'ISPS', name: 'ISPS Charge' },
  { code: 'VGM', name: 'VGM Fee' },
];
const rateImportTargetLabels: Record<string, string> = {
  rateNo: '运价编号', polCode: '起运港代码', polName: '起运港名称', podCode: '目的港代码', podName: '目的港名称', carrierCode: '船司代码', serviceName: '航线服务', effectiveDate: '生效日期', expiryDate: '失效日期', etd: 'ETD', transitDays: '航程天数', supplierName: '供应商', contractNo: '合约号', currency: '运价币种', status: '状态', containerType: '箱型', costAmount: '采购成本', sellAmount: '标准售价', priceCurrency: '价格币种', remark: '备注', price20GpCost: '20GP 采购成本', price20GpSell: '20GP 标准售价', price40GpCost: '40GP 采购成本', price40GpSell: '40GP 标准售价', price40HqCost: '40HQ 采购成本', price40HqSell: '40HQ 标准售价', price45HqCost: '45HQ 采购成本', price45HqSell: '45HQ 标准售价', vesselVoyage: '船名航次', sailingPattern: '开船日', freeTime: '免箱期', freeTimeDemurrage: '免堆期', freeTimeDetention: '免箱期', commodityRestriction: '品名限制', surcharge: '附加费', surchargeBaf: 'BAF', surchargePss: 'PSS', surchargeDoc: 'DOC', surchargeSeal: 'SEAL',
};

export default function RatesPage() {
  const { apiFetch, user } = useAuth();
  const [items, setItems] = useState<Rate[]>([]);
  const [pagination, setPagination] = useState<RateListResponse['pagination']>({ page: 1, pageSize: 20, total: 0, totalPages: 0 });
  const [page, setPage] = useState(1); const [searchInput, setSearchInput] = useState(''); const [search, setSearch] = useState('');
  const [status, setStatus] = useState<RateStatus | ''>(''); const [polCode, setPolCode] = useState(''); const [podCode, setPodCode] = useState(''); const [carrierCode, setCarrierCode] = useState(''); const [containerType, setContainerType] = useState(''); const [validOn, setValidOn] = useState('');
  const [loading, setLoading] = useState(true); const [error, setError] = useState<RateApiError | null>(null); const [reloadKey, setReloadKey] = useState(0);
  const [dialogOpen, setDialogOpen] = useState(false); const [importOpen, setImportOpen] = useState(false); const [editingRate, setEditingRate] = useState<Rate | null>(null); const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => { const timer = window.setTimeout(() => { setPage(1); setSearch(searchInput.trim()); }, 300); return () => window.clearTimeout(timer); }, [searchInput]);
  const load = useCallback(async () => {
    setLoading(true); setError(null);
    const query = new URLSearchParams({ page: String(page), pageSize: '20' });
    if (search) query.set('search', search); if (status) query.set('status', status); if (polCode) query.set('polCode', polCode.trim().toUpperCase()); if (podCode) query.set('podCode', podCode.trim().toUpperCase()); if (carrierCode) query.set('carrierCode', carrierCode.trim().toUpperCase()); if (containerType) query.set('containerType', containerType); if (validOn) query.set('validOn', validOn);
    try { const result = await requestJson<RateListResponse>(apiFetch, `/api/v1/rates?${query.toString()}`); setItems(result.items); setPagination(result.pagination); }
    catch (caught) { setError(toRateError(caught)); } finally { setLoading(false); }
  }, [apiFetch, carrierCode, containerType, page, podCode, polCode, search, status, validOn]);
  useEffect(() => { void load(); }, [load, reloadKey]);
  const canManage = hasPermission(user, 'rate.manage');
  const [rateToDelete, setRateToDelete] = useState<Rate | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const deleteRate = useCallback(async (rate: Rate) => {
    if (deletingId) return;
    setDeletingId(rate.id); setDeleteError(null); setNotice(null);
    try {
      await requestJson(apiFetch, '/api/v1/rates/' + rate.id, { method: 'DELETE' });
      setRateToDelete(null);
      setNotice('运价 ' + rate.rateNo + ' 已删除。');
      if (items.length === 1 && page > 1) setPage(page - 1);
      else setReloadKey(value => value + 1);
    } catch (caught) { setDeleteError(localizeRateError(toRateError(caught))); }
    finally { setDeletingId(null); }
  }, [apiFetch, items.length, page, deletingId]);
  const columns = useMemo<DataTableColumn<Rate>[]>(() => [
    { key: 'rateNo', header: 'Rate', render: (rate) => <div><div className="font-medium">{rate.rateNo}</div><div className="mt-0.5 text-xs text-muted">{rate.serviceName ?? '未设置服务'}</div></div> },
    { key: 'route', header: '航线', render: (rate) => <div><div>{rate.polCode} → {rate.podCode}</div><div className="mt-0.5 text-xs text-muted">{rate.polName} → {rate.podName}</div></div> },
    { key: 'carrierCode', header: '船司', render: (rate) => rate.carrierCode },
    { key: 'prices', header: '箱型 / 成本', render: (rate) => <div className="space-y-1">{rate.prices.map((price) => <div key={price.id} className="whitespace-nowrap"><span className="inline-block w-12 text-xs text-muted">{price.containerType}</span> {formatMoney(price.costAmount, price.currency)}</div>)}</div> },
    { key: 'validity', header: '有效期', render: (rate) => <div className="whitespace-nowrap">{formatDate(rate.effectiveDate)}<div className="mt-0.5 text-xs text-muted">至 {formatDate(rate.expiryDate)}</div></div> },
    { key: 'supplierName', header: '供应方 / 合约', render: (rate) => <div>{rate.supplierName ?? '—'}<div className="mt-0.5 text-xs text-muted">{rate.contractNo ?? '无合约号'}</div></div> },
    { key: 'status', header: '状态', render: (rate) => <StatusBadge tone={statusTones[rate.status]}>{statusLabels[rate.status]}</StatusBadge> },
    ...(canManage ? [{ key: 'actions', header: '操作', className: 'w-[190px] min-w-[190px] whitespace-nowrap text-right', render: (rate: Rate) => <div className="flex flex-wrap items-center justify-end gap-2"><button aria-label={`编辑运价 ${rate.rateNo}`} className="inline-flex h-8 shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-md border border-border bg-surface px-3.5 text-sm font-medium shadow-sm transition-colors hover:border-primary hover:bg-primary/5 hover:text-primary focus:outline-none focus:ring-2 focus:ring-primary/20" onClick={() => setEditingRate(rate)} type="button"><Pencil aria-hidden className="size-3.5 shrink-0" /> <span>编辑</span></button><button aria-label={"删除运价 " + rate.rateNo} className="inline-flex h-8 items-center gap-1.5 rounded-md border border-danger/25 px-3 text-sm font-medium text-danger hover:bg-danger/10 disabled:cursor-not-allowed disabled:opacity-40" disabled={Boolean(deletingId) || Boolean(rate._count?.quotes)} title={rate._count?.quotes ? "已用于报价，只能通过编辑停用" : "删除这条运价"} onClick={() => { setDeleteError(null); setRateToDelete(rate); }} type="button"><Trash2 aria-hidden className="size-3.5" />{deletingId === rate.id ? "删除中…" : "删除"}</button>{rate._count?.quotes ? <span className="w-full text-xs text-muted">已用于报价，只能停用</span> : null}</div> }] : []),
  ], [canManage, deletingId]);
  const clearFilters = () => { setSearchInput(''); setSearch(''); setStatus(''); setPolCode(''); setPodCode(''); setCarrierCode(''); setContainerType(''); setValidOn(''); setPage(1); };
  const saved = (editing: boolean) => { setDialogOpen(false); setEditingRate(null); setNotice(editing ? '运价已更新，修改记录已写入审计日志。' : '运价创建成功。'); setPage(1); setReloadKey((value) => value + 1); };

  return <div className="space-y-5">
    <PageHeader actions={canManage ? <div className="flex items-center gap-2"><button className="inline-flex h-9 items-center gap-2 rounded border border-border bg-surface px-4 text-sm font-semibold hover:border-primary hover:text-primary" onClick={() => setImportOpen(true)} type="button"><Upload aria-hidden className="size-4" /> Excel 导入</button><button className="inline-flex h-9 items-center gap-2 rounded bg-primary px-4 text-sm font-semibold text-surface" onClick={() => setDialogOpen(true)} type="button"><Plus aria-hidden className="size-4" /> 新建运价</button></div> : undefined} description="维护航线、船司、有效期、箱型成本和附加费用。" eyebrow="运营后台" title="运价" />
    {notice ? <div className="flex items-center justify-between rounded border border-success/20 bg-success/10 px-4 py-3 text-sm text-success"><span>{notice}</span><button aria-label="关闭提示" onClick={() => setNotice(null)} type="button"><X aria-hidden className="size-4" /></button></div> : null}
    {rateToDelete ? <DeleteRateDialog rate={rateToDelete} busy={Boolean(deletingId)} error={deleteError} onCancel={() => { if (!deletingId) { setRateToDelete(null); setDeleteError(null); } }} onConfirm={() => void deleteRate(rateToDelete)} /> : null}
    {error?.code === 'PERMISSION_DENIED' ? <PermissionDeniedState /> : <section className="overflow-hidden rounded border border-border bg-surface">
      <FilterBar onClear={clearFilters} onSearchChange={setSearchInput} placeholder="搜索运价编号、港口、供应方或合约号" searchValue={searchInput}>
        <input aria-label="起运港代码" className={filterClass} onChange={(event) => { setPolCode(event.target.value); setPage(1); }} placeholder="POL" value={polCode} />
        <input aria-label="目的港代码" className={filterClass} onChange={(event) => { setPodCode(event.target.value); setPage(1); }} placeholder="POD" value={podCode} />
        <input aria-label="船司代码" className={filterClass} onChange={(event) => { setCarrierCode(event.target.value); setPage(1); }} placeholder="Carrier" value={carrierCode} />
        <select aria-label="箱型" className={filterClass} onChange={(event) => { setContainerType(event.target.value); setPage(1); }} value={containerType}><option value="">全部箱型</option>{containerTypes.map((type) => <option key={type}>{type}</option>)}</select>
        <select aria-label="运价状态" className={filterClass} onChange={(event) => { setStatus(event.target.value as RateStatus | ''); setPage(1); }} value={status}><option value="">全部状态</option>{Object.entries(statusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>
        <label className="flex items-center gap-2 text-xs text-muted">有效日<input aria-label="有效日" className={filterClass} onChange={(event) => { setValidOn(event.target.value); setPage(1); }} type="date" value={validOn} /></label>
      </FilterBar>
      {loading ? <LoadingState rows={6} /> : error ? <div className="p-4"><ErrorState description={error.message} onRetry={() => setReloadKey((value) => value + 1)} /></div> : items.length === 0 ? <div className="p-4"><EmptyState description={search || status || polCode || podCode || carrierCode || containerType || validOn ? '请调整筛选条件后重试。' : '新建运价后，记录会显示在这里。'} title="暂无匹配运价" /></div> : <><DataTable columns={columns} data={items} getRowKey={(rate) => rate.id} /><Pagination page={page} pagination={pagination} setPage={setPage} /></>}
    </section>}
    {dialogOpen || editingRate ? <RateDialog apiFetch={apiFetch} rate={editingRate} onClose={() => { setDialogOpen(false); setEditingRate(null); }} onSaved={() => saved(Boolean(editingRate))} /> : null}
    {importOpen ? <ImportRateDialog apiFetch={apiFetch} onClose={() => setImportOpen(false)} onCompleted={() => { setNotice('Excel 运价导入完成，列表已刷新。'); setPage(1); setReloadKey((value) => value + 1); }} /> : null}
  </div>;
}

function ImportRateDialog({
  apiFetch,
  onClose,
  onCompleted,
}: {
  apiFetch: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
  onClose: () => void;
  onCompleted: () => void;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [importJob, setImportJob] = useState<RateImport | null>(null);
  const [analysis, setAnalysis] = useState<RateImportAnalysis | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [retryKey, setRetryKey] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const busy =
    analyzing ||
    confirming ||
    importJob?.status === 'PENDING' ||
    importJob?.status === 'PROCESSING';
  useEffect(() => {
    if (!importJob || !['PENDING', 'PROCESSING'].includes(importJob.status)) return;
    const timer = window.setInterval(() => {
      void requestJson<RateImport>(apiFetch, `/api/v1/rate-imports/${importJob.id}`)
        .then((result) => {
          setImportJob(result);
          if (result.status === 'COMPLETED') {
            window.clearInterval(timer);
            onCompleted();
          }
        })
        .catch(() => {
          window.clearInterval(timer);
          setError('暂时无法获取导入进度，请重试查询，无需重新导入。');
        });
    }, 1000);
    return () => window.clearInterval(timer);
  }, [apiFetch, importJob, onCompleted, retryKey]);
  useEffect(() => {
    if (!file) return;
    let active = true;
    setAnalyzing(true);
    setError(null);
    setAnalysis(null);
    setImportJob(null);
    const form = new FormData();
    form.append('file', file);
    void requestJson<RateImportAnalysis>(apiFetch, '/api/v1/rates/import/analyze', {
      method: 'POST',
      body: form,
    })
      .then((result) => {
        if (active) setAnalysis(result);
      })
      .catch((caught) => {
        if (active) setError(toRateError(caught).message);
      })
      .finally(() => {
        if (active) setAnalyzing(false);
      });
    return () => {
      active = false;
    };
  }, [apiFetch, file]);
  const chooseFile = (next?: File) => {
    if (!next || busy) return;
    if (!next.name.toLowerCase().endsWith('.xlsx') || next.size > 5 * 1024 * 1024 || !next.size) {
      setError('请选择不超过 5 MB 的 .xlsx 文件。');
      return;
    }
    setError(null);
    setImportJob(null);
    setAnalysis(null);
    setFile(next);
  };
  const downloadTemplate = async () => {
    setDownloading(true);
    setError(null);
    try {
      const response = await apiFetch('/api/v1/rates/import-template');
      if (!response.ok) throw new RateApiError('模板下载失败，请稍后重试。');
      const url = URL.createObjectURL(await response.blob());
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = 'rate-import-template-v2.xlsx';
      anchor.click();
      URL.revokeObjectURL(url);
    } catch (caught) {
      setError(toRateError(caught).message);
    } finally {
      setDownloading(false);
    }
  };
  return (
    <div
      aria-labelledby="import-rate-title"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-start justify-end bg-foreground/30"
      role="dialog"
    >
      <button
        aria-label="关闭导入表单"
        className="absolute inset-0"
        disabled={busy}
        onClick={onClose}
        type="button"
      />
      <div
        className={`relative flex h-full w-full flex-col border-l border-border bg-surface shadow-xl ${analysis && !importJob ? 'max-w-4xl' : 'max-w-xl'}`}
      >
        <header className="flex shrink-0 items-start justify-between gap-4 border-b border-border px-6 py-5">
          <div>
            <h2 className="text-lg font-semibold" id="import-rate-title">
              {importJob ? '导入结果' : analysis ? '核对运价' : '从 Excel 添加运价'}
            </h2>
            <p className="mt-1 text-sm text-muted">
              {importJob
                ? '在这里查看本次导入的处理结果。'
                : analysis
                  ? '确认航线、价格和有效期，再导入。'
                  : '上传手头的运价表，先预览，再决定是否导入。'}
            </p>
          </div>
          <button
            aria-label="关闭"
            className="grid size-9 shrink-0 place-items-center rounded border border-border disabled:opacity-40"
            disabled={busy}
            onClick={onClose}
            type="button"
          >
            <X className="size-4" />
          </button>
        </header>
        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto p-6">
          <input
            ref={inputRef}
            aria-label="选择运价 Excel"
            accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            className="sr-only"
            disabled={busy}
            onChange={(event) => {
              chooseFile(event.target.files?.[0]);
              event.target.value = '';
            }}
            type="file"
          />
          {!file ? (
            <>
              <div
                className="rounded-lg border-2 border-dashed border-primary/30 bg-primary/5 px-5 py-10 text-center"
                onDragOver={(event) => event.preventDefault()}
                onDrop={(event) => {
                  event.preventDefault();
                  chooseFile(event.dataTransfer.files[0]);
                }}
              >
                <Upload aria-hidden className="mx-auto size-7 text-primary" />
                <p className="mt-4 font-medium">把运价表拖到这里</p>
                <button
                  className="mt-4 h-10 rounded bg-primary px-6 text-sm font-semibold text-surface hover:bg-primary/90"
                  onClick={() => inputRef.current?.click()}
                  type="button"
                >
                  选择 Excel 文件
                </button>
                <p className="mt-3 text-xs text-muted">支持 .xlsx，最大 5 MB</p>
              </div>
              <p className="text-sm leading-6 text-muted">
                可使用船公司、代理或同行发来的表格。读取后会显示航线和箱型价格，缺少的信息再补充。
              </p>
              <button
                className="inline-flex items-center gap-2 text-sm text-primary underline-offset-4 hover:underline disabled:opacity-40"
                disabled={downloading}
                onClick={() => void downloadTemplate()}
                type="button"
              >
                <Download className="size-4" />
                {downloading ? '下载中…' : '还没有运价表？下载示例模板'}
              </button>
            </>
          ) : (
            <div className="flex items-center justify-between gap-3 rounded bg-sidebar px-3 py-2.5 text-sm">
              <div className="min-w-0">
                <p className="truncate font-medium" title={file.name}>
                  {file.name}
                </p>
                <p className="text-xs text-muted">{formatFileSize(file.size)}</p>
              </div>
              {!importJob ? (
                <button
                  className="shrink-0 font-medium text-primary disabled:opacity-40"
                  disabled={busy}
                  onClick={() => inputRef.current?.click()}
                  type="button"
                >
                  更换文件
                </button>
              ) : null}
            </div>
          )}
          {analyzing ? (
            <p role="status" className="py-8 text-center text-sm text-muted">
              正在读取表格，整理航线和价格…
            </p>
          ) : null}
          {analysis && file && !importJob ? (
            <WorkbookAnalysis
              analysis={analysis}
              apiFetch={apiFetch}
              file={file}
              onConfirmed={setImportJob}
              onConfirming={setConfirming}
            />
          ) : null}
          {error ? (
            <div
              role="alert"
              className="rounded border border-danger/20 bg-danger/10 p-3 text-sm text-danger"
            >
              {error}
              {importJob ? (
                <button
                  className="ml-3 underline"
                  onClick={() => {
                    setError(null);
                    setRetryKey((value) => value + 1);
                  }}
                  type="button"
                >
                  重试获取进度
                </button>
              ) : file && !analyzing ? (
                <button
                  className="ml-3 underline"
                  onClick={() => setFile(new File([file], file.name, { type: file.type }))}
                  type="button"
                >
                  重新读取
                </button>
              ) : null}
            </div>
          ) : null}
          {importJob ? <ImportResultPanel importJob={importJob} /> : null}
        </div>
        {importJob ? (
          <footer className="flex shrink-0 justify-end border-t border-border px-6 py-4">
            <button
              className="h-10 rounded bg-primary px-5 text-sm font-semibold text-surface disabled:opacity-40"
              disabled={busy && !error}
              onClick={onClose}
              type="button"
            >
              {importJob.status === 'COMPLETED' ? '完成，查看运价' : '关闭'}
            </button>
          </footer>
        ) : null}
      </div>
    </div>
  );
}

function WorkbookAnalysis({
  analysis,
  apiFetch,
  file,
  onConfirmed,
  onConfirming,
}: {
  analysis: RateImportAnalysis;
  apiFetch: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
  file: File;
  onConfirmed: (job: RateImport) => void;
  onConfirming: (busy: boolean) => void;
}) {
  const initialSheet = bestRateImportSheetIndex(analysis);
  const [sheetIndex, setSheetIndex] = useState(initialSheet);
  const [candidateIndex, setCandidateIndex] = useState(0);
  const [mapping, setMapping] = useState<Record<number, string>>({});
  const [profileName, setProfileName] = useState('');
  const [rememberFormat, setRememberFormat] = useState(false);
  const [defaults, setDefaults] = useState<ImportFixDefaults>({
    effectiveDate: '',
    expiryDate: '',
    currency: '',
  });
  const [saving, setSaving] = useState(false);
  const [confirmBusy, setConfirmBusy] = useState(false);
  const previewRequest = useRef(0);
  const [previewing, setPreviewing] = useState(false);
  const [preview, setPreview] = useState<RateImportPreview | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const sheet = analysis.sheets[sheetIndex];
  const candidate = sheet?.headerCandidates[candidateIndex];
  const buildMappings = useCallback(
    (source: Record<number, string>) =>
      Object.entries(source)
        .filter(([, targetField]) => targetField)
        .map(([sourceColumn, targetField]) => ({
          sourceColumn: Number(sourceColumn),
          sourceLabel: candidate?.labels[Number(sourceColumn) - 1] ?? '',
          targetField,
        })),
    [candidate],
  );
  const previewRows = useCallback(
    async (source = mapping, fixDefaults = defaults) => {
      if (!sheet || !candidate) return;
      const mappings = buildMappings(source);
      if (!mappings.length) {
        setMessage('这个 Excel 暂时无法自动识别字段，请在“识别不对？调整工作表和列”中配置字段。');
        return;
      }
      const requestId = ++previewRequest.current;
      setPreview(null);
      setPreviewing(true);
      setMessage(null);
      const form = new FormData();
      form.append('file', file);
      form.append(
        'configuration',
        JSON.stringify({
          sheetName: sheet.name,
          headerRow: candidate.row,
          headerDepth: candidate.depth,
          mappings,
          defaults: cleanDefaults(fixDefaults),
        }),
      );
      try {
        const result = await requestJson<RateImportPreview>(
          apiFetch,
          '/api/v1/rates/import/preview',
          { method: 'POST', body: form },
        );
        if (requestId === previewRequest.current) setPreview(result);
      } catch (caught) {
        if (requestId === previewRequest.current) setMessage(toRateError(caught).message);
      } finally {
        if (requestId === previewRequest.current) setPreviewing(false);
      }
    },
    [apiFetch, buildMappings, candidate, defaults, file, mapping, sheet],
  );
  useEffect(() => {
    const nextMapping = Object.fromEntries(
      (candidate?.suggestions ?? []).map((item) => [item.column, item.targetField]),
    );
    setMapping(nextMapping);
    setMessage(null);
    setPreview(null);
    setPreviewing(false);
    if (candidate) void previewRows(nextMapping);
    return () => {
      previewRequest.current += 1;
    };
  }, [candidate]);
  const saveProfile = async () => {
    if (!sheet || !candidate) return;
    if (!profileName.trim()) {
      setMessage('请填写格式名称。');
      return;
    }
    const mappings = buildMappings(mapping);
    if (!mappings.length) {
      setMessage('请至少选择一列对应的运价信息。');
      return;
    }
    setSaving(true);
    setMessage(null);
    try {
      await requestJson(apiFetch, '/api/v1/rate-imports/mapping-profiles', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          name: profileName.trim(),
          sheetName: sheet.name,
          headerRow: candidate.row,
          headerDepth: candidate.depth,
          mappings,
        }),
      });
      setMessage(`已记住「${profileName.trim()}」格式。`);
    } catch (caught) {
      setMessage(toRateError(caught).message);
    } finally {
      setSaving(false);
    }
  };
  return (
    <fieldset disabled={confirmBusy} className="min-w-0 space-y-5">
      <div className="text-sm text-muted">
        {candidate
          ? '当前工作表：' + sheet?.name
          : '未找到运价数据，请选择包含航线和价格的工作表。'}
      </div>
      {previewing ? (
        <p role="status" className="py-6 text-center text-sm text-muted">
          正在整理运价预览…
        </p>
      ) : null}
      {preview ? (
        <RateImportIssueActions
          defaults={defaults}
          onApply={(next) => {
            setDefaults(next);
            void previewRows(mapping, next);
          }}
          preview={preview}
        />
      ) : null}
      {message ? (
        <p role="status" className="text-sm text-muted">
          {message}
        </p>
      ) : null}
      <details className="rounded border border-border bg-surface p-4" open={!candidate}>
        <summary className="flex cursor-pointer list-none items-center gap-2 text-sm font-semibold">
          <ChevronDown className="size-4" /> 识别不对？调整工作表和列
        </summary>
        <div className="mt-4 space-y-4 border-t border-border pt-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="text-sm">
              <span className="font-medium">选择工作表</span>
              <select
                className={`${inputClass} mt-1.5`}
                onChange={(event) => {
                  setSheetIndex(Number(event.target.value));
                  setCandidateIndex(0);
                }}
                value={sheetIndex}
              >
                {analysis.sheets.map((item, index) => (
                  <option key={`${item.index}-${item.name}`} value={index}>
                    {item.name}（{item.rowCount} 行 × {item.columnCount} 列）
                  </option>
                ))}
              </select>
            </label>
            <label className="text-sm">
              <span className="font-medium">哪一行是列标题？</span>
              <select
                className={`${inputClass} mt-1.5`}
                disabled={!sheet?.headerCandidates.length}
                onChange={(event) => setCandidateIndex(Number(event.target.value))}
                value={candidateIndex}
              >
                {sheet?.headerCandidates.map((item, index) => (
                  <option key={`${item.row}-${item.depth}`} value={index}>
                    第 {item.row} 行 · {item.depth === 2 ? '双层表头' : '单层表头'} · 识别{' '}
                    {item.suggestions.length} 项
                  </option>
                ))}
              </select>
            </label>
          </div>
          {sheet && candidate ? (
            <>
              <div className="max-h-80 overflow-auto rounded border border-border bg-surface">
                <table className="w-full text-left text-xs">
                  <thead className="sticky top-0 bg-sidebar">
                    <tr>
                      <th className="px-2 py-2">Excel 列</th>
                      <th className="px-2 py-2">表格里的列名</th>
                      <th className="px-2 py-2">对应的运价信息</th>
                    </tr>
                  </thead>
                  <tbody>
                    {candidate.labels.map((label, index) =>
                      label ? (
                        <tr className="border-t border-border" key={`${index}-${label}`}>
                          <td className="px-2 py-1.5">{index + 1}</td>
                          <td className="px-2 py-1.5">{label}</td>
                          <td className="px-2 py-1.5">
                            <select
                              aria-label={`${label} 映射字段`}
                              className="h-8 w-full rounded border border-border bg-surface px-2"
                              onChange={(event) => {
                                previewRequest.current += 1;
                                setPreviewing(false);
                                setMapping((current) => ({
                                  ...current,
                                  [index + 1]: event.target.value,
                                }));
                                setPreview(null);
                              }}
                              value={mapping[index + 1] ?? ''}
                            >
                              <option value="">不导入此列</option>
                              {Object.entries(rateImportTargetLabels).map(([value, text]) => (
                                <option
                                  disabled={Object.entries(mapping).some(
                                    ([column, target]) =>
                                      Number(column) !== index + 1 && target === value,
                                  )}
                                  key={value}
                                  value={value}
                                >
                                  {text}
                                </option>
                              ))}
                            </select>
                          </td>
                        </tr>
                      ) : null,
                    )}
                  </tbody>
                </table>
              </div>
              <div className="grid gap-3 border-t border-border pt-3 sm:grid-cols-[1fr_auto]">
                <label className="flex items-center gap-2 text-sm">
                  <input
                    checked={rememberFormat}
                    onChange={(event) => setRememberFormat(event.target.checked)}
                    type="checkbox"
                  />{' '}
                  记住这个 Excel 格式
                </label>
                <button
                  className="h-10 rounded border border-primary px-4 text-sm font-semibold text-primary disabled:opacity-40"
                  disabled={previewing}
                  onClick={() => void previewRows()}
                  type="button"
                >
                  {previewing ? '生成中…' : '重新预览'}
                </button>
                {rememberFormat ? (
                  <>
                    <input
                      className={inputClass}
                      maxLength={120}
                      onChange={(event) => setProfileName(event.target.value)}
                      placeholder="格式名称，例如：东方海外 FCL 运价"
                      value={profileName}
                    />
                    <button
                      className="h-10 rounded bg-primary px-4 text-sm font-semibold text-surface disabled:opacity-40"
                      disabled={saving}
                      onClick={() => void saveProfile()}
                      type="button"
                    >
                      {saving ? '保存中…' : '记住这个格式'}
                    </button>
                  </>
                ) : null}
              </div>
            </>
          ) : (
            <p className="text-sm text-warning">
              没有找到列标题。请选择运价所在的工作表，以及起运港、目的港、船司和价格这些标题所在的行。
            </p>
          )}
        </div>
      </details>
      {preview ? (
        <RateImportPreviewPanel
          key={preview.previewToken}
          apiFetch={apiFetch}
          onConfirmed={onConfirmed}
          onConfirming={(value) => {
            setConfirmBusy(value);
            onConfirming(value);
          }}
          preview={preview}
        />
      ) : null}
    </fieldset>
  );
}

function rateImportIssueActionText(type: string) {
  const actions: Record<string, string> = {
    missing_basics:
      '如果这份 Excel 所有航线共用同一有效期或币种，在下方填写一次并应用到全部运价；如果每行不同，请回到“识别不对？调整工作表和列”映射对应列。',
    missing_pol:
      '请在“识别不对？调整工作表和列”中把起运港代码或起运港名称列映射为起运港；常见值如 CNSHA、上海、Shanghai。',
    missing_pod:
      '请在“识别不对？调整工作表和列”中把目的港代码或目的港名称列映射为目的港；常见值如 USLAX、洛杉矶、Los Angeles。',
    missing_carrier: '请把船司、Carrier、船公司代码等列映射为船司；系统需要船司代码才能保存运价。',
    missing_currency:
      '请映射币种列，或在有效期和币种补齐区选择默认币种。币种需使用 USD、CNY、EUR 这类三位代码。',
    date: '请映射生效日期和失效日期，或在有效期和币种补齐区填写统一日期后重新预览。',
    price: '请确认价格列是否映射到 20GP、40GP、40HQ 等箱型成本或售价，金额只支持非负数字。',
    container: '长表格式需要映射箱型列；宽表格式请把 20GP、40GP、40HQ 等价格列分别映射到对应箱型。',
  };
  return actions[type] ?? '请检查该字段的表头映射和单元格内容，修正后重新预览。';
}

function RateImportPreviewPanel({
  preview,
  apiFetch,
  onConfirmed,
  onConfirming,
}: {
  preview: RateImportPreview;
  apiFetch: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
  onConfirmed: (job: RateImport) => void;
  onConfirming: (busy: boolean) => void;
}) {
  const [acceptWarnings, setAcceptWarnings] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [confirmError, setConfirmError] = useState<string | null>(null);
  const confirm = async () => {
    setConfirming(true);
    onConfirming(true);
    setConfirmError(null);
    try {
      onConfirmed(
        await requestJson<RateImport>(apiFetch, '/api/v1/rates/import/confirm', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ previewToken: preview.previewToken, acceptWarnings }),
        }),
      );
    } catch (caught) {
      setConfirmError(toRateError(caught).message);
    } finally {
      setConfirming(false);
      onConfirming(false);
    }
  };
  return (
    <div className="space-y-4">
      <div>
        <h3 className="font-semibold">共 {preview.summary.rateCount} 条运价，核对后即可导入</h3>
        <p className="mt-1 text-sm text-muted">
          包含 {preview.summary.priceCount} 个箱型价格、{preview.summary.chargeCount}{' '}
          项附加费。请与原表核对。
        </p>
      </div>
      <div className="max-h-96 overflow-auto rounded border border-border">
        <table className="w-full text-left text-xs">
          <thead className="sticky top-0 bg-sidebar">
            <tr>
              <th className="px-3 py-3">Excel 行</th>
              <th className="px-3 py-3">航线 / 船司</th>
              <th className="px-3 py-3">有效期</th>
              <th className="px-3 py-3">箱型价格</th>
              <th className="px-3 py-3">附加费</th>
            </tr>
          </thead>
          <tbody>
            {preview.rates.map((rate) => (
              <tr
                className="border-t border-border align-top"
                key={`${rate.source.sheet}-${rate.source.row}`}
              >
                <td className="px-3 py-3">{rate.source.row}</td>
                <td className="px-3 py-3">
                  <div className="font-medium">
                    {rate.polCode ?? rate.polName ?? '待补充'} →{' '}
                    {rate.podCode ?? rate.podName ?? '待补充'}
                  </div>
                  <div className="mt-1 text-muted">{rate.carrierCode ?? '船司待补充'}</div>
                </td>
                <td className="whitespace-nowrap px-3 py-3">
                  {rate.effectiveDate ?? '待补充'}
                  <div className="mt-1 text-muted">至 {rate.expiryDate ?? '待补充'}</div>
                </td>
                <td className="px-3 py-3">
                  {rate.prices.length
                    ? rate.prices.map((price) => (
                        <div className="mb-2 last:mb-0" key={price.containerType}>
                          <span className="font-semibold">
                            {price.containerType} · {price.currency}
                          </span>
                          <div className="mt-1 text-muted">
                            成本 {price.costAmount ?? '未提供'} / 售价{' '}
                            {price.sellAmount ?? '未提供'}
                          </div>
                        </div>
                      ))
                    : '待补充'}
                </td>
                <td className="px-3 py-3">
                  {rate.charges?.length
                    ? rate.charges.map((charge, index) => (
                        <div key={index}>
                          {charge.chargeCode}：{charge.currency} {charge.amount}/
                          {charge.chargeBasis === 'PER_BL'
                            ? '提单'
                            : charge.chargeBasis === 'PER_SHIPMENT'
                              ? '票'
                              : '柜'}
                        </div>
                      ))
                    : '未识别到'}
                </td>
              </tr>
            ))}
            {!preview.rates.length ? (
              <tr>
                <td colSpan={5} className="p-6 text-center text-muted">
                  暂时没有可导入的运价。请检查工作表和列的对应关系。
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
      {preview.truncated ? (
        <p className="text-xs text-muted">这里只展示前 100 条，导入和问题检查覆盖全部数据。</p>
      ) : null}
      <div className="sticky bottom-0 space-y-3 border-t border-border bg-surface py-4">
        {preview.summary.warningCount > 0 ? (
          <label className="flex items-start gap-2 text-sm">
            <input
              checked={acceptWarnings}
              className="mt-0.5"
              onChange={(event) => setAcceptWarnings(event.target.checked)}
              type="checkbox"
            />
            我已核对上方提醒，确认继续导入
          </label>
        ) : null}
        {confirmError ? (
          <p role="alert" className="text-sm text-danger">
            {confirmError}
          </p>
        ) : null}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-xs text-muted">
            {preview.summary.errorCount
              ? '请先修正上方问题，再重新预览。'
              : '确认后将保存到运价列表。'}
          </p>
          <button
            className="h-10 rounded bg-primary px-5 text-sm font-semibold text-surface hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-40"
            disabled={
              confirming ||
              preview.summary.rateCount === 0 ||
              preview.summary.errorCount > 0 ||
              (preview.summary.warningCount > 0 && !acceptWarnings)
            }
            onClick={() => void confirm()}
            type="button"
          >
            {confirming ? '正在导入…' : `确认导入 ${preview.summary.rateCount} 条运价`}
          </button>
        </div>
      </div>
    </div>
  );
}

function RateImportIssueActions({
  preview,
  defaults,
  onApply,
}: {
  preview: RateImportPreview;
  defaults: ImportFixDefaults;
  onApply: (defaults: ImportFixDefaults) => void;
}) {
  const [draft, setDraft] = useState(defaults);
  const issues = aggregateImportIssues(preview.issues);
  if (!issues.length) return null;
  const needsBasics = issues.some((issue) =>
    ['missing_basics', 'missing_currency', 'date'].includes(issue.type),
  );
  return (
    <details
      open={preview.summary.errorCount > 0}
      className="rounded border border-warning/30 bg-warning/5 p-4"
    >
      <summary className="cursor-pointer text-sm font-semibold">
        {preview.summary.errorCount
          ? `${preview.summary.errorCount} 个问题需要处理`
          : '没有阻止导入的问题'}
        {preview.summary.warningCount ? ` · ${preview.summary.warningCount} 项提醒，请核对` : ''}
      </summary>
      <div className="mt-3 divide-y divide-border">
        {issues.map((issue) => (
          <div className="py-3 first:pt-0" key={`${issue.type}-${issue.severity}`}>
            <p className="text-sm font-medium">
              {issue.title}
              <span className="ml-2 text-xs text-muted">
                {issue.severity === 'ERROR' ? '需修正' : '提醒'}
              </span>
            </p>
            <p className="mt-1 text-xs text-muted">
              涉及 {issue.affectedCount} 处
              {issue.rows.length ? `，Excel 第 ${issue.rows.slice(0, 4).join('、')} 行等` : ''}。
              {rateImportIssueActionText(issue.type)}
            </p>
          </div>
        ))}
      </div>
      {needsBasics ? (
        <div className="mt-3 border-t border-border pt-4">
          <p className="text-sm font-medium">整张表使用相同的有效期或币种？在这里统一补充</p>
          <div className="mt-3 grid gap-3 sm:grid-cols-3">
            <label className="text-xs">
              生效日期
              <input
                className={`${inputClass} mt-1.5`}
                onChange={(event) =>
                  setDraft((current) => ({ ...current, effectiveDate: event.target.value }))
                }
                type="date"
                value={draft.effectiveDate}
              />
            </label>
            <label className="text-xs">
              截止日期
              <input
                className={`${inputClass} mt-1.5`}
                onChange={(event) =>
                  setDraft((current) => ({ ...current, expiryDate: event.target.value }))
                }
                type="date"
                value={draft.expiryDate}
              />
            </label>
            <label className="text-xs">
              币种
              <select
                className={`${inputClass} mt-1.5`}
                onChange={(event) =>
                  setDraft((current) => ({ ...current, currency: event.target.value }))
                }
                value={draft.currency}
              >
                <option value="">不补充币种</option>
                {currencyOptions.map((currency) => (
                  <option key={currency}>{currency}</option>
                ))}
              </select>
            </label>
          </div>
          <button
            className={`${secondaryButton} mt-3`}
            onClick={() => onApply(draft)}
            type="button"
          >
            应用并更新预览
          </button>
        </div>
      ) : null}
    </details>
  );
}

function ImportResultPanel({ importJob }: { importJob: RateImport }) {
  return (
    <section
      className={`rounded border p-4 ${importJob.status === 'FAILED' ? 'border-danger/20 bg-danger/5' : importJob.status === 'COMPLETED' ? 'border-success/20 bg-success/5' : 'border-border bg-background'}`}
    >
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">
          {importJob.status === 'COMPLETED' ? '导入完成' : '导入进度'}
        </h3>
        <StatusBadge
          tone={
            importJob.status === 'COMPLETED'
              ? 'success'
              : importJob.status === 'FAILED'
                ? 'danger'
                : 'info'
          }
        >
          {importJob.status === 'PENDING'
            ? '等待处理'
            : importJob.status === 'PROCESSING'
              ? '正在处理'
              : importJob.status === 'COMPLETED'
                ? '导入完成'
                : '导入失败'}
        </StatusBadge>
      </div>
      <dl className="mt-3 grid grid-cols-3 gap-3 text-sm">
        <div>
          <dt className="text-muted">运价行</dt>
          <dd className="mt-1 font-semibold">{importJob.totalRows}</dd>
        </div>
        <div>
          <dt className="text-muted">成功</dt>
          <dd className="mt-1 font-semibold text-success">{importJob.successRows}</dd>
        </div>
        <div>
          <dt className="text-muted">失败</dt>
          <dd className="mt-1 font-semibold text-danger">{importJob.failedRows}</dd>
        </div>
      </dl>
      {importJob.errorMessage ? (
        <p className="mt-3 text-sm text-danger">{humanizeImportJobError(importJob.errorMessage)}</p>
      ) : null}
    </section>
  );
}

function aggregateImportIssues(issues: RateImportPreview['issues']) {
  const labels: Record<string, { type: string; title: string }> = {
    polCode: { type: 'missing_pol', title: '起运港未正确识别' },
    polName: { type: 'missing_pol', title: '起运港未正确识别' },
    podCode: { type: 'missing_pod', title: '目的港未正确识别' },
    podName: { type: 'missing_pod', title: '目的港未正确识别' },
    carrierCode: { type: 'missing_carrier', title: '船司未正确识别' },
    effectiveDate: { type: 'missing_basics', title: '缺少有效期和币种' },
    expiryDate: { type: 'missing_basics', title: '缺少有效期和币种' },
    currency: { type: 'missing_basics', title: '缺少有效期和币种' },
    containerType: { type: 'container', title: '箱型价格需要确认' },
    prices: { type: 'price', title: '价格格式需要确认' },
  };
  const grouped = new Map<string, { type: string; severity: 'ERROR' | 'WARNING'; title: string; rows: number[]; affectedCount: number }>();
  for (const issue of issues) {
    const mapped = labels[issue.source.field ?? ''] ?? issueTitleFromMessage(issue);
    const key = `${issue.severity}:${mapped.type}`;
    const current = grouped.get(key) ?? { ...mapped, severity: issue.severity, rows: [], affectedCount: 0 };
    if (!current.rows.includes(issue.source.row)) current.rows.push(issue.source.row);
    current.affectedCount = current.rows.length;
    grouped.set(key, current);
  }
  return [...grouped.values()].sort((a, b) => Number(b.severity === 'ERROR') - Number(a.severity === 'ERROR') || b.affectedCount - a.affectedCount);
}

function bestRateImportSheetIndex(analysis: RateImportAnalysis) {
  const ranked = analysis.sheets
    .map((sheet, index) => ({ index, score: (sheet.headerCandidates[0]?.score ?? 0) - instructionSheetPenalty(sheet.name) }))
    .sort((a, b) => b.score - a.score || a.index - b.index);
  return ranked[0] && ranked[0].score > 0 ? ranked[0].index : 0;
}

function instructionSheetPenalty(name: string) {
  return /说明|instruction|readme|目录|cover/i.test(name) ? 20 : 0;
}

function issueTitleFromMessage(issue: RateImportPreview['issues'][number]) {
  if (issue.code.includes('DATE')) return { type: 'date', title: '有效期需要确认' };
  if (issue.code.includes('CURRENCY')) return { type: 'missing_currency', title: '币种需要确认' };
  if (issue.code.includes('AMOUNT') || issue.code.includes('PRICE')) return { type: 'price', title: '价格格式需要确认' };
  if (issue.code.includes('CONTAINER')) return { type: 'container', title: '箱型价格需要确认' };
  return { type: issue.code.toLowerCase(), title: issue.message.replace(/[A-Za-z][A-Za-z0-9_]+/g, '字段') };
}

function cleanDefaults(defaults: ImportFixDefaults) {
  return { ...(defaults.effectiveDate ? { effectiveDate: defaults.effectiveDate } : {}), ...(defaults.expiryDate ? { expiryDate: defaults.expiryDate } : {}), ...(defaults.currency ? { currency: defaults.currency } : {}) };
}

function humanizeImportJobError(message: string) {
  return message.replace(/Import validation failed with \d+ error\(s\)/, '导入前校验未通过，请根据上方问题修正后重新导入。').replace(/[A-Za-z][A-Za-z0-9_]+/g, '字段');
}

function RateDialog({ apiFetch, rate, onClose, onSaved }: { apiFetch: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>; rate: Rate | null; onClose: () => void; onSaved: () => void }) {
  const [submitError, setSubmitError] = useState<string | null>(null);
  const { register, control, handleSubmit, watch, setValue, setError, formState: { errors, isSubmitting } } = useForm<RateFormValues>({ resolver: zodResolver(rateFormSchema), defaultValues: rate ? rateDefaults(rate) : emptyRateDefaults() });
  const prices = useFieldArray({ control, name: 'prices' }); const charges = useFieldArray({ control, name: 'charges' }); const mainCurrency = watch('currency');
  const polCodeField = register('polCode'); const podCodeField = register('podCode'); const carrierCodeField = register('carrierCode'); const currencyField = register('currency');
  const applyPort = (target: 'polName' | 'podName', code: string) => { const port = commonPorts.find((item) => item.code === upper(code)); if (port) setValue(target, port.name, { shouldDirty: true, shouldValidate: true }); };
  useEffect(() => { if (!rate) { prices.fields.forEach((_, index) => setValue(`prices.${index}.currency`, mainCurrency.toUpperCase())); charges.fields.forEach((_, index) => setValue(`charges.${index}.currency`, mainCurrency.toUpperCase())); } }, [charges.fields, mainCurrency, prices.fields, rate, setValue]);
  const submit = handleSubmit(async (values) => {
    setSubmitError(null);
    const payload = { ...values, rateNo: upper(values.rateNo), polCode: upper(values.polCode), podCode: upper(values.podCode), carrierCode: upper(values.carrierCode), currency: upper(values.currency), ...(values.etd ? { etd: new Date(values.etd).toISOString() } : { etd: undefined }), ...(values.transitDays ? { transitDays: Number(values.transitDays) } : { transitDays: undefined }), serviceName: optional(values.serviceName), supplierName: optional(values.supplierName), contractNo: optional(values.contractNo), prices: values.prices.map((price) => ({ ...price, containerType: upper(price.containerType), currency: upper(price.currency), remark: optional(price.remark), ...(price.sellAmount ? {} : { sellAmount: undefined }) })), charges: values.charges.map((charge) => ({ ...charge, chargeCode: upper(charge.chargeCode), chargeName: charge.chargeName.trim(), currency: upper(charge.currency), ...(charge.chargeBasis === 'PER_CONTAINER' ? { containerType: charge.containerType } : { containerType: undefined }) })) };
    try { await requestJson<Rate>(apiFetch, rate ? `/api/v1/rates/${rate.id}` : '/api/v1/rates', { method: rate ? 'PATCH' : 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload) }); onSaved(); } catch (caught) { const error = toRateError(caught); applyRateServerFieldErrors(error.details?.fieldErrors, setError); setSubmitError(localizeRateError(error)); }
  });
  return <div aria-labelledby="rate-dialog-title" aria-modal="true" className="fixed inset-0 z-50 flex items-start justify-end bg-foreground/30" role="dialog"><button aria-label="关闭运价表单" className="absolute inset-0" onClick={onClose} type="button" /><div className="relative h-full w-full max-w-4xl overflow-y-auto border-l border-border bg-surface shadow-xl">
    <div className="sticky top-0 z-10 flex items-start justify-between border-b border-border bg-surface px-5 py-4"><div><h2 className="text-lg font-semibold" id="rate-dialog-title">{rate ? '编辑运价' : '新建运价'}</h2><p className="mt-1 text-sm text-muted"><RequiredLegend>字段为保存运价前必须填写</RequiredLegend>；金额最多保留 4 位小数。</p></div><button aria-label="关闭" className="grid size-9 place-items-center rounded border border-border" onClick={onClose} type="button"><X aria-hidden className="size-4" /></button></div>
    <form className="space-y-6 p-5" onSubmit={(event) => void submit(event)}><RateFormOptionLists />{submitError ? <div className="rounded border border-danger/20 bg-danger/10 px-3 py-2 text-sm text-danger">{submitError}</div> : null}
      <fieldset className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4"><legend className="col-span-full text-sm font-semibold">基础信息</legend>
        <FormField error={errors.rateNo?.message} label="运价编号 *"><input {...register('rateNo')} className={inputClass} placeholder="例如 RATE-SHA-LAX-001" /></FormField><FormField error={errors.carrierCode?.message} label="船司代码 *"><input {...carrierCodeField} className={inputClass} list="rate-carrier-options" placeholder="选择或输入船司代码" /></FormField><FormField error={errors.serviceName?.message} label="航线服务"><input {...register('serviceName')} className={inputClass} list="rate-service-options" placeholder="选择或输入服务名称" /></FormField><FormField error={errors.status?.message} label="状态 *"><select {...register('status')} className={inputClass}>{Object.entries(statusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></FormField>
        <FormField error={errors.polCode?.message} label="POL 代码 *"><input {...polCodeField} className={inputClass} list="rate-port-options" onBlur={(event) => { void polCodeField.onBlur(event); applyPort('polName', event.target.value); }} placeholder="选择或输入起运港" /></FormField><FormField error={errors.polName?.message} label="POL 名称 *"><input {...register('polName')} className={inputClass} placeholder="选择港口代码后自动带出" /></FormField><FormField error={errors.podCode?.message} label="POD 代码 *"><input {...podCodeField} className={inputClass} list="rate-port-options" onBlur={(event) => { void podCodeField.onBlur(event); applyPort('podName', event.target.value); }} placeholder="选择或输入目的港" /></FormField><FormField error={errors.podName?.message} label="POD 名称 *"><input {...register('podName')} className={inputClass} placeholder="选择港口代码后自动带出" /></FormField>
        <FormField error={errors.effectiveDate?.message} label="生效日 *"><input {...register('effectiveDate')} className={inputClass} type="date" /></FormField><FormField error={errors.expiryDate?.message} label="失效日 *"><input {...register('expiryDate')} className={inputClass} type="date" /></FormField><FormField error={errors.etd?.message} label="ETD"><input {...register('etd')} className={inputClass} type="datetime-local" /></FormField><FormField error={errors.transitDays?.message} label="航程（天）"><input {...register('transitDays')} className={inputClass} inputMode="numeric" /></FormField>
        <FormField error={errors.supplierName?.message} label="供应方"><input {...register('supplierName')} className={inputClass} placeholder="可选，供应商或代理名称" /></FormField><FormField error={errors.contractNo?.message} label="合约号"><input {...register('contractNo')} className={inputClass} placeholder="可选" /></FormField><FormField error={errors.currency?.message} label="基础币种 *"><select {...currencyField} className={inputClass}>{currencyOptions.map((currency) => <option key={currency} value={currency}>{currency}</option>)}</select></FormField>
      </fieldset>
      <fieldset className="space-y-3 border-t border-border pt-5"><div className="flex items-center justify-between"><legend className="text-sm font-semibold"><FieldLabel label="箱型价格" required /></legend><button className={secondaryButton} onClick={() => prices.append({ containerType: '40HQ', costAmount: '', sellAmount: '', currency: mainCurrency || 'USD', remark: '' })} type="button"><Plus className="size-3.5" /> 添加箱型</button></div>{errors.prices?.root?.message ? <p className="text-xs text-danger">{errors.prices.root.message}</p> : null}
        {prices.fields.map((field, index) => <div className="grid gap-3 rounded border border-border bg-background p-3 sm:grid-cols-2 lg:grid-cols-[110px_1fr_1fr_100px_1.4fr_40px]" key={field.id}><FormField error={errors.prices?.[index]?.containerType?.message} label="箱型"><select {...register(`prices.${index}.containerType`)} className={inputClass}>{containerTypes.map((type) => <option key={type}>{type}</option>)}</select></FormField><FormField error={errors.prices?.[index]?.costAmount?.message} label="采购成本"><input {...register(`prices.${index}.costAmount`)} className={inputClass} inputMode="decimal" placeholder="例如 1250.00" /></FormField><FormField error={errors.prices?.[index]?.sellAmount?.message} label="标准售价"><input {...register(`prices.${index}.sellAmount`)} className={inputClass} inputMode="decimal" placeholder="可选" /></FormField><FormField error={errors.prices?.[index]?.currency?.message} label="币种"><select {...register(`prices.${index}.currency`)} className={inputClass}>{currencyOptions.map((currency) => <option key={currency} value={currency}>{currency}</option>)}</select></FormField><FormField error={errors.prices?.[index]?.remark?.message} label="备注"><input {...register(`prices.${index}.remark`)} className={inputClass} /></FormField><button aria-label="删除箱型价格" className="mt-6 grid size-10 place-items-center rounded border border-border text-muted hover:text-danger disabled:opacity-30" disabled={prices.fields.length === 1} onClick={() => prices.remove(index)} type="button"><Trash2 className="size-4" /></button></div>)}
      </fieldset>
      <fieldset className="space-y-3 border-t border-border pt-5"><div className="flex items-center justify-between"><legend className="text-sm font-semibold">附加费用</legend><button className={secondaryButton} onClick={() => charges.append({ chargeCode: '', chargeName: '', chargeBasis: 'PER_CONTAINER', containerType: '40HQ', amount: '', currency: mainCurrency || 'USD', isIncluded: false })} type="button"><Plus className="size-3.5" /> 添加费用</button></div>
        {charges.fields.length === 0 ? <p className="rounded border border-dashed border-border p-4 text-sm text-muted">暂无附加费用。</p> : charges.fields.map((field, index) => { const basis = watch(`charges.${index}.chargeBasis`); const chargeCodeField = register(`charges.${index}.chargeCode`); return <div className="grid gap-3 rounded border border-border bg-background p-3 sm:grid-cols-2 lg:grid-cols-[110px_1.3fr_120px_100px_1fr_90px_40px]" key={field.id}><FormField error={errors.charges?.[index]?.chargeCode?.message} label="费用代码"><input {...chargeCodeField} className={inputClass} list="rate-charge-options" onBlur={(event) => { void chargeCodeField.onBlur(event); const charge = chargeOptions.find((item) => item.code === upper(event.target.value)); if (charge) setValue(`charges.${index}.chargeName`, charge.name, { shouldDirty: true, shouldValidate: true }); }} placeholder="选择或输入" /></FormField><FormField error={errors.charges?.[index]?.chargeName?.message} label="费用名称"><input {...register(`charges.${index}.chargeName`)} className={inputClass} placeholder="选择费用代码后自动带出" /></FormField><FormField error={errors.charges?.[index]?.chargeBasis?.message} label="计价单位"><select {...register(`charges.${index}.chargeBasis`)} className={inputClass}>{Object.entries(basisLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></FormField><FormField error={errors.charges?.[index]?.containerType?.message} label="箱型"><select {...register(`charges.${index}.containerType`)} className={inputClass} disabled={basis !== 'PER_CONTAINER'}><option value="">请选择</option>{containerTypes.map((type) => <option key={type}>{type}</option>)}</select></FormField><FormField error={errors.charges?.[index]?.amount?.message} label="金额"><input {...register(`charges.${index}.amount`)} className={inputClass} inputMode="decimal" placeholder="例如 100.00" /></FormField><FormField error={errors.charges?.[index]?.currency?.message} label="币种"><select {...register(`charges.${index}.currency`)} className={inputClass}>{currencyOptions.map((currency) => <option key={currency} value={currency}>{currency}</option>)}</select></FormField><button aria-label="删除附加费用" className="mt-6 grid size-10 place-items-center rounded border border-border text-muted hover:text-danger" onClick={() => charges.remove(index)} type="button"><Trash2 className="size-4" /></button><label className="col-span-full inline-flex items-center gap-2 text-sm"><input {...register(`charges.${index}.isIncluded`)} type="checkbox" /> 已包含在主运价中</label></div>; })}
      </fieldset>
      <div className="sticky bottom-0 flex justify-end gap-2 border-t border-border bg-surface py-4"><button className="h-9 rounded border border-border px-4 text-sm font-semibold" disabled={isSubmitting} onClick={onClose} type="button">取消</button><button className="h-9 rounded bg-primary px-4 text-sm font-semibold text-surface disabled:opacity-50" disabled={isSubmitting} type="submit">{isSubmitting ? '保存中…' : rate ? '保存变更' : '保存运价'}</button></div>
    </form>
  </div></div>;
}

function Pagination({ page, pagination, setPage }: { page: number; pagination: RateListResponse['pagination']; setPage: React.Dispatch<React.SetStateAction<number>> }) { return <div className="flex items-center justify-between border-t border-border px-4 py-3 text-sm text-muted"><span>共 {pagination.total} 条运价</span><div className="flex items-center gap-2"><button aria-label="上一页" className={pageButtonClass} disabled={page <= 1} onClick={() => setPage((value) => Math.max(1, value - 1))} type="button"><ChevronLeft className="size-4" /></button><span>第 {pagination.page} / {Math.max(1, pagination.totalPages)} 页</span><button aria-label="下一页" className={pageButtonClass} disabled={page >= pagination.totalPages} onClick={() => setPage((value) => value + 1)} type="button"><ChevronRight className="size-4" /></button></div></div>; }
function RateFormOptionLists() { return <><datalist id="rate-port-options">{commonPorts.map((port) => <option key={port.code} value={port.code}>{port.name}</option>)}</datalist><datalist id="rate-carrier-options">{carrierOptions.map((carrier) => <option key={carrier.code} value={carrier.code}>{carrier.name}</option>)}</datalist><datalist id="rate-service-options"><option value="Pacific Express" /><option value="Europe Weekly" /><option value="Transpacific" /><option value="Asia Europe" /></datalist><datalist id="rate-charge-options">{chargeOptions.map((charge) => <option key={charge.code} value={charge.code}>{charge.name}</option>)}</datalist></>; }
function FormField({ label, error, children }: { label: string; error?: string; children: React.ReactNode }) { return <label className="block text-sm"><FieldLabel label={label} /><span className="mt-1.5 block">{children}</span>{error ? <span className="mt-1 block text-xs text-danger">{error}</span> : null}</label>; }
function emptyRateDefaults(): RateFormValues { const today = new Date().toISOString().slice(0, 10); return { rateNo: '', polCode: '', polName: '', podCode: '', podName: '', carrierCode: '', serviceName: '', effectiveDate: today, expiryDate: today, etd: '', transitDays: '', supplierName: '', contractNo: '', currency: 'USD', status: 'DRAFT', prices: [{ containerType: '40HQ', costAmount: '', sellAmount: '', currency: 'USD', remark: '' }], charges: [] }; }
function rateDefaults(rate: Rate): RateFormValues { return { rateNo: rate.rateNo, polCode: rate.polCode, polName: rate.polName, podCode: rate.podCode, podName: rate.podName, carrierCode: rate.carrierCode, serviceName: rate.serviceName ?? '', effectiveDate: rate.effectiveDate.slice(0, 10), expiryDate: rate.expiryDate.slice(0, 10), etd: rate.etd ? new Date(rate.etd).toISOString().slice(0, 16) : '', transitDays: rate.transitDays?.toString() ?? '', supplierName: rate.supplierName ?? '', contractNo: rate.contractNo ?? '', currency: rate.currency, status: rate.status, prices: rate.prices.map((price) => ({ containerType: price.containerType, costAmount: price.costAmount, sellAmount: price.sellAmount ?? '', currency: price.currency, remark: price.remark ?? '' })), charges: rate.charges.map((charge) => ({ chargeCode: charge.chargeCode, chargeName: charge.chargeName, chargeBasis: charge.chargeBasis, containerType: charge.containerType ?? '', amount: charge.amount, currency: charge.currency, isIncluded: charge.isIncluded })) }; }
async function requestJson<T>(apiFetch: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>, input: RequestInfo | URL, init?: RequestInit): Promise<T> { const response = await apiFetch(input, init); const payload = (await response.json().catch(() => undefined)) as T | ApiErrorPayload | undefined; if (!response.ok) { const error = payload as ApiErrorPayload | undefined; throw new RateApiError(error?.message ?? '运价服务暂时不可用，请稍后重试。', error?.code, error?.details); } return payload as T; }
function applyRateServerFieldErrors(fieldErrors: Record<string, string[]> | undefined, setError: UseFormSetError<RateFormValues>) {
  if (!fieldErrors) return;
  for (const field of Object.keys(fieldErrors)) {
    const path = rateFieldPath(field);
    if (path) setError(path, { type: 'server', message: rateFieldErrorMessage(field) });
  }
}
function rateFieldPath(field: string): FieldPath<RateFormValues> | null {
  const normalized = field.replace(/\[(\d+)\]/g, '.$1');
  if (normalized.startsWith('prices.')) return normalized as FieldPath<RateFormValues>;
  if (normalized.startsWith('charges.')) return normalized as FieldPath<RateFormValues>;
  if (normalized in rateRootFieldMessages) return normalized as FieldPath<RateFormValues>;
  return null;
}
const rateRootFieldMessages: Partial<Record<keyof RateFormValues, string>> = {
  rateNo: '请输入有效且未重复的运价编号',
  polCode: '请输入有效起运港代码',
  polName: '起运港名称为必填项',
  podCode: '请输入有效目的港代码',
  podName: '目的港名称为必填项',
  carrierCode: '请输入有效船司代码',
  serviceName: '航线服务不能超过 150 个字符',
  effectiveDate: '请选择有效生效日',
  expiryDate: '请选择有效失效日',
  etd: '请选择有效 ETD',
  transitDays: '航程必须是 0–365 的整数',
  supplierName: '供应方不能超过 200 个字符',
  contractNo: '合约号不能超过 100 个字符',
  currency: '请选择三位币种代码',
  status: '请选择有效状态',
  prices: '至少添加一个有效箱型价格',
  charges: '请检查附加费用',
};
function rateFieldErrorMessage(field: string) {
  const normalized = field.replace(/\[(\d+)\]/g, '.$1');
  if (normalized.endsWith('.containerType')) return '请选择有效箱型';
  if (normalized.endsWith('.costAmount')) return '请输入有效采购成本';
  if (normalized.endsWith('.sellAmount')) return '请输入有效标准售价';
  if (normalized.endsWith('.currency')) return '请选择三位币种代码';
  if (normalized.endsWith('.remark')) return '备注不能超过 500 个字符';
  if (normalized.endsWith('.chargeCode')) return '请输入有效费用代码';
  if (normalized.endsWith('.chargeName')) return '请输入费用名称';
  if (normalized.endsWith('.chargeBasis')) return '请选择计价单位';
  if (normalized.endsWith('.amount')) return '请输入有效费用金额';
  return rateRootFieldMessages[normalized as keyof RateFormValues] ?? '请检查该字段';
}
function localizeRateError(error: RateApiError): string {
  const messages: Record<string, string> = {
    VALIDATION_ERROR: '请检查标红字段后重新提交。',
    RATE_NUMBER_EXISTS: '运价编号已存在，请更换后重新提交。',
    INVALID_RATE_VALIDITY: '失效日不能早于生效日。',
    DUPLICATE_CONTAINER_TYPE: '同一运价不能重复添加相同箱型。',
    INVALID_RATE_CHARGE: '请检查附加费用的计价单位和箱型。',
    RATE_IN_USE: '这条运价已用于报价，不能删除。请通过编辑将其停用。',
    RATE_NOT_FOUND: '运价不存在或已无法访问。',
    PERMISSION_DENIED: '你没有维护运价的权限。',
  };
  return (error.code && messages[error.code]) || error.message || '保存失败，请稍后重试。';
}
function toRateError(error: unknown): RateApiError { return error instanceof RateApiError ? error : new RateApiError(error instanceof Error ? error.message : '运价服务暂时不可用，请稍后重试。'); }
function upper(value: string) { return value.trim().toUpperCase(); } function optional(value: string) { return value.trim() || undefined; }
function formatDate(value: string) { return value.slice(0, 10); } function formatMoney(value: string, currency: string) { return `${currency} ${new Intl.NumberFormat('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(value))}`; }
function formatFileSize(size: number) { return size >= 1024 * 1024 ? `${(size / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(size / 1024))} KB`; }
const inputClass = 'h-10 w-full rounded border border-border bg-surface px-3 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/15 disabled:cursor-not-allowed disabled:bg-sidebar disabled:text-muted';
const filterClass = 'h-9 min-w-24 rounded border border-border bg-surface px-3 text-sm outline-none focus:border-primary';
const secondaryButton = 'inline-flex h-8 items-center gap-1.5 rounded border border-border px-3 text-sm font-medium hover:border-primary hover:text-primary';
const pageButtonClass = 'grid size-9 place-items-center rounded border border-border disabled:cursor-not-allowed disabled:opacity-40';
