import { formatMoney } from '@/lib/formatters';

export function MoneyDisplay({ amount, currency }: { amount: string; currency: string }) {
  return (
    <span className="whitespace-nowrap font-medium tabular-nums">
      {formatMoney(amount, currency)}
    </span>
  );
}
