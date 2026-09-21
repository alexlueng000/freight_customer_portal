interface CustomerFeeSummary {
  chargeName: string;
  chargeBasis: 'PER_CONTAINER' | 'PER_BL' | 'PER_SHIPMENT' | null;
  containerType: string | null;
}

// Only describe explicit customer-facing fee fields. Never infer exclusions or service commitments.
export function generateQuoteCustomerTerms(items: CustomerFeeSummary[], validUntil: string): string | null {
  if (!items.length || items.some((item) => !item.chargeName.trim()) || !/^\d{4}-\d{2}-\d{2}$/.test(validUntil)) return null;
  const fees = items.map((item) => {
    const basis = item.chargeBasis ?? (item.containerType ? 'PER_CONTAINER' : 'PER_SHIPMENT');
    const unit = basis === 'PER_BL' ? '按提单' : basis === 'PER_SHIPMENT' ? '按票'
      : item.containerType ? `按箱 / ${item.containerType}` : '按箱';
    return `${item.chargeName.trim()}（${unit}）`;
  });
  const details = `本次报价费用项目：${fees.join('、')}。`;
  const ending = `各项计费数量、销售单价及金额以本报价费用明细为准。\n报价有效期至：${validUntil}。`;
  const full = `${details}\n${ending}`;
  // A large quote already has a full fee table; reference it rather than truncate a fee name or exceed the stored limit.
  return full.length <= 2000 ? full : `本次报价共 ${items.length} 项费用，具体项目及计费方式见本报价费用明细。\n${ending}`;
}
