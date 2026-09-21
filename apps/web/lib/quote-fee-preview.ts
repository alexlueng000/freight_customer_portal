// Draft-only display calculations. Saved prices and profits are calculated by the API with Decimal.
const scale = 10000n;
function units(value: string): bigint | null {
  if (!/^\d{1,14}(?:\.\d{1,4})?$/.test(value.trim())) return null;
  const [whole, fraction = ''] = value.trim().split('.');
  return BigInt(whole!) * scale + BigInt(fraction.padEnd(4, '0'));
}
function format(value: bigint): string {
  const sign = value < 0 ? '-' : '';
  const absolute = value < 0 ? -value : value;
  return `${sign}${absolute / scale}.${(absolute % scale).toString().padStart(4, '0')}`;
}
export function previewFee(item: { quantity: string; unitPrice: string; costAmount: string | null }) {
  const quantity = units(item.quantity);
  const sell = units(item.unitPrice);
  const cost = item.costAmount === null ? null : units(item.costAmount);
  if (quantity === null || quantity <= 0n || sell === null) return { sell: null, cost: null, profit: null };
  const sellTotal = (quantity * sell + scale / 2n) / scale;
  const costTotal = cost === null ? null : (quantity * cost + scale / 2n) / scale;
  return { sell: format(sellTotal), cost: costTotal === null ? null : format(costTotal), profit: costTotal === null ? null : format(sellTotal - costTotal) };
}
