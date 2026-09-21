import { Prisma } from '@prisma/client';

export function quotePricing(items: Array<{ id: string; currency: string; quantity: Prisma.Decimal; costAmount: Prisma.Decimal | null; amount: Prisma.Decimal }>) {
  const groups = new Map<string, { cost: Prisma.Decimal; sell: Prisma.Decimal; missingCost: boolean }>();
  const lines = items.map((item) => {
    const cost = item.costAmount?.mul(item.quantity).toDecimalPlaces(4) ?? null;
    const profit = cost === null ? null : item.amount.minus(cost);
    const group = groups.get(item.currency) ?? { cost: new Prisma.Decimal(0), sell: new Prisma.Decimal(0), missingCost: false };
    group.cost = group.cost.plus(cost ?? 0);
    group.sell = group.sell.plus(item.amount);
    group.missingCost ||= cost === null;
    groups.set(item.currency, group);
    return { id: item.id, costTotal: cost?.toString() ?? null, profit: profit?.toString() ?? null,
      margin: profit !== null && item.amount.gt(0) ? profit.div(item.amount).mul(100).toFixed(2) : null };
  });
  return { lines, summaries: [...groups].map(([currency, group]) => ({ currency,
    cost: group.missingCost ? null : group.cost.toString(), knownCost: group.cost.toString(), sell: group.sell.toString(),
    profit: group.missingCost ? null : group.sell.minus(group.cost).toString(), missingCost: group.missingCost,
    margin: !group.missingCost && group.sell.gt(0) ? group.sell.minus(group.cost).div(group.sell).mul(100).toFixed(2) : null,
  })) };
}
