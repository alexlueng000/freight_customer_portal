export function quoteAmounts(quote: { currency: string; totalAmount: string | null; amountsByCurrency?: Record<string, string> | null }): string {
  if (quote.totalAmount === null) return '待销售确认';
  const totals = Object.entries(quote.amountsByCurrency ?? {});
  if (!totals.length) totals.push([quote.currency, quote.totalAmount]);
  return totals.map(([currency, amount]) => `${currency} ${Number(amount).toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`).join(' + ');
}
