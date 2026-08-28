export function MoneyDisplay({ amount, currency }: { amount: string; currency: string }) {
  return (
    <span className="whitespace-nowrap font-medium tabular-nums">
      {currency} {amount}
    </span>
  );
}
