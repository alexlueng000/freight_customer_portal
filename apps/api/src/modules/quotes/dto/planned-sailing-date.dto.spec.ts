import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { UpdateQuoteReviewDto } from './update-quote-review.dto.js';
import { OverrideQuotePricesDto } from './override-quote-prices.dto.js';

describe.each([UpdateQuoteReviewDto, OverrideQuotePricesDto])('%s planned sailing date', (Dto) => {
  const base = { reason: 'Approved adjustment', items: [{ itemId: 'item', unitPrice: '100' }] };
  it.each([undefined, null, '2024-02-29', '2026-09-25', '2030-12-31'])('accepts %s', async (plannedSailingDate) => {
    const errors = await validate(plainToInstance(Dto, { ...base, plannedSailingDate }));
    expect(errors).toHaveLength(0);
  });
  it.each(['', ' ', '2026-02-30', '2025-02-29', '2026-13-01', '0000-01-01', '2026-9-1', '2026-09-25T12:00:00Z', 20260925])('rejects %s', async (plannedSailingDate) => {
    const errors = await validate(plainToInstance(Dto, { ...base, plannedSailingDate }));
    expect(errors.map((error) => error.property)).toContain('plannedSailingDate');
  });
});
