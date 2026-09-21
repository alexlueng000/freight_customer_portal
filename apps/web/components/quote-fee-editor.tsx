'use client';

interface FeeItem {
  id: string;
  chargeCode: string;
  chargeName: string;
  chargeBasis: 'PER_CONTAINER' | 'PER_BL' | 'PER_SHIPMENT' | null;
  containerType: string | null;
  quantity: string;
  unitPrice: string;
  costAmount: string | null;
  currency: string;
  amount: string;
}

const input = 'h-10 w-full min-w-24 rounded border border-border bg-surface px-2 outline-none focus:border-primary focus:ring-2 focus:ring-primary/15 disabled:bg-sidebar/50 disabled:text-muted';
const cell = 'px-3 py-3 align-top';
const money = (value: string, currency: string) => `${currency} ${Number(value).toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 4 })}`;
const basisLabels = { PER_CONTAINER: '按箱', PER_BL: '按提单', PER_SHIPMENT: '按票' };

export function QuoteFeeEditor({ items, savedItems, currency, totalAmount, changed, editable, disabled, onChange }: {
  items: FeeItem[];
  savedItems: FeeItem[];
  currency: string;
  totalAmount: string;
  changed: boolean;
  editable: boolean;
  disabled: boolean;
  onChange: (items: FeeItem[]) => void;
}) {
  const update = (id: string, patch: Partial<FeeItem>) => onChange(items.map((item) => item.id === id ? { ...item, ...patch } : item));
  const containers = [...new Set(savedItems.filter((item) => item.chargeCode === 'OCEAN_FREIGHT' && item.containerType).map((item) => item.containerType!))];
  const removed = savedItems.filter((item) => !items.some((draft) => draft.id === item.id));
  return <>
    {editable ? <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-3">
      <p className="text-xs text-muted">所有费用以 {currency} 报价，发布后对客户可见；成本仅内部可见。海运费箱型箱量沿用客户需求。</p>
      <button type="button" disabled={disabled || items.length >= 100} className="h-10 rounded border border-primary/30 px-4 text-sm font-semibold text-primary disabled:opacity-40"
        onClick={() => onChange([...items, { id: `new-${crypto.randomUUID()}`, chargeCode: 'MANUAL_CHARGE', chargeName: '', chargeBasis: 'PER_SHIPMENT', containerType: null, quantity: '1', costAmount: null, unitPrice: '', currency, amount: '0' }])}>
        ＋ 添加费用
      </button>
    </div> : null}
    <div className="overflow-x-auto">
      <table className="w-full min-w-[960px] text-left text-sm">
        <thead><tr className="border-b border-border bg-sidebar text-xs text-muted">
          {['费用名称', '计费方式 / 箱型', '计费数量', `成本单价（${currency}）`, `销售单价（${currency}）`, '金额', ...(editable ? ['操作'] : [])].map((label) => <th key={label} className="px-3 py-3 font-semibold">{label}</th>)}
        </tr></thead>
        <tbody>{items.map((item, index) => {
          const ocean = item.chargeCode === 'OCEAN_FREIGHT';
          const basis = item.chargeBasis ?? (item.containerType ? 'PER_CONTAINER' : 'PER_SHIPMENT');
          const label = `第 ${index + 1} 行`;
          return <tr key={item.id} className="border-b border-border">
            <td className={`${cell} min-w-44`}>{editable ? <input autoFocus={item.id.startsWith('new-') && !item.chargeName} aria-label={`${label}费用名称`} className={input} disabled={disabled} maxLength={150} placeholder="例如：文件费、提货费" value={item.chargeName} onChange={(event) => update(item.id, { chargeName: event.target.value })} /> : item.chargeName}</td>
            <td className={`${cell} min-w-36`}>
              {editable && !ocean ? <select aria-label={`${label}计费方式`} className={input} value={basis} disabled={disabled} onChange={(event) => {
                const chargeBasis = event.target.value as NonNullable<FeeItem['chargeBasis']>;
                const source = savedItems.find((row) => row.chargeCode === 'OCEAN_FREIGHT');
                update(item.id, { chargeBasis, containerType: chargeBasis === 'PER_CONTAINER' ? containers[0] ?? null : null, quantity: chargeBasis === 'PER_CONTAINER' ? source?.quantity ?? '1' : '1' });
              }}>{Object.entries(basisLabels).map(([value, text]) => <option key={value} value={value}>{text}</option>)}</select> : <div className="py-2">{basisLabels[basis]}{item.containerType ? ` / ${item.containerType}` : ''}</div>}
              {editable && !ocean && basis === 'PER_CONTAINER' ? <select aria-label={`${label}箱型`} className={`${input} mt-2`} value={item.containerType ?? ''} disabled={disabled} onChange={(event) => update(item.id, { containerType: event.target.value })}>
                <option value="">选择箱型</option>{containers.map((type) => <option key={type} value={type}>{type}</option>)}
              </select> : null}
            </td>
            <td className={cell}>{editable && !ocean ? <input aria-label={`${label}计费数量`} inputMode="decimal" maxLength={19} className={input} value={item.quantity} disabled={disabled} onChange={(event) => update(item.id, { quantity: event.target.value })} /> : <div className="py-2">{Number(item.quantity)}</div>}</td>
            <td className={cell}>{editable ? <input aria-label={`${label}成本单价`} inputMode="decimal" maxLength={19} className={input} value={item.costAmount ?? ''} placeholder="待确认" disabled={disabled} onChange={(event) => update(item.id, { costAmount: event.target.value || null })} /> : item.costAmount === null ? '待确认' : money(item.costAmount, item.currency)}</td>
            <td className={cell}>{editable ? <input aria-label={`${item.chargeName || label}销售单价（${currency}）`} inputMode="decimal" maxLength={19} className={input} value={item.unitPrice} disabled={disabled} onChange={(event) => update(item.id, { unitPrice: event.target.value })} /> : money(item.unitPrice, item.currency)}</td>
            <td className={`${cell} whitespace-nowrap font-semibold`}><div className="py-2">{changed ? '保存后更新' : money(item.amount, item.currency)}</div></td>
            {editable ? <td className={cell}>{ocean ? <span className="block py-2 text-xs text-muted">基础海运费</span> : <button type="button" className="h-10 whitespace-nowrap text-danger disabled:opacity-40" aria-label={`删除${item.chargeName || label}`} disabled={disabled} onClick={() => onChange(items.filter((row) => row.id !== item.id))}>删除</button>}</td> : null}
          </tr>;
        })}</tbody>
        <tfoot><tr className="bg-primary/5 font-semibold"><td colSpan={editable ? 6 : 5} className="px-3 py-4 text-right">报价总额</td><td className="whitespace-nowrap px-3 py-4 text-right text-primary">{changed ? '保存后重新计算' : money(totalAmount, currency)}</td></tr></tfoot>
      </table>
    </div>
    {removed.length ? <div className="space-y-2 px-5 py-3 text-sm" aria-live="polite">{removed.map((item) => <div key={item.id} className="flex items-center gap-3"><span className="text-muted">待删除：{item.chargeName}</span><button type="button" className="text-primary disabled:opacity-40" disabled={disabled} onClick={() => onChange([...items, item])}>撤销删除</button></div>)}</div> : null}
  </>;
}
