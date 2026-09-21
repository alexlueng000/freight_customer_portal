import { Prisma } from '@prisma/client';
import { quotePricing } from './quote-pricing.js';

describe('quote profit calculation', () => {
  it('uses Decimal per-unit quantities, separates currencies, and marks missing costs', () => {
    const line = (id: string, currency: string, quantity: string, cost: string | null, sell: string) => ({
      id, currency, quantity: new Prisma.Decimal(quantity), costAmount: cost === null ? null : new Prisma.Decimal(cost), amount: new Prisma.Decimal(sell),
    });
    const pricing = quotePricing([line('ocean', 'USD', '2', '100.125', '250.5'), line('document', 'USD', '1', '0.1', '0.3'), line('pickup', 'CNY', '3', '20', '90'), line('pending', 'EUR', '1', null, '100')]);
    expect(pricing.lines[0]).toMatchObject({ costTotal: '200.25', profit: '50.25', margin: '20.06' });
    expect(pricing.summaries).toEqual([
      { currency: 'USD', cost: '200.35', knownCost: '200.35', sell: '250.8', profit: '50.45', margin: '20.12', missingCost: false },
      { currency: 'CNY', cost: '60', knownCost: '60', sell: '90', profit: '30', margin: '33.33', missingCost: false },
      { currency: 'EUR', cost: null, knownCost: '0', sell: '100', profit: null, margin: null, missingCost: true },
    ]);
  });
});
