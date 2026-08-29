import { MarkupType, Prisma } from '@prisma/client';
import { CustomerRatePricingService } from './customer-rate-pricing.service.js';

describe('CustomerRatePricingService', () => {
  const service = new CustomerRatePricingService();
  it('uses standard sell price before applying fixed markup', () => {
    expect(service.calculate(new Prisma.Decimal('1000'), new Prisma.Decimal('1200'), MarkupType.FIXED, new Prisma.Decimal('100')).toString()).toBe('1300');
  });
  it('falls back to cost and applies percentage markup without JavaScript floats', () => {
    expect(service.calculate(new Prisma.Decimal('999.99'), null, MarkupType.PERCENT, new Prisma.Decimal('5.25')).toString()).toBe('1052.4895');
  });
  it('returns the base price when markup is NONE', () => {
    expect(service.calculate(new Prisma.Decimal('800'), null, MarkupType.NONE, null).toString()).toBe('800');
  });
});
