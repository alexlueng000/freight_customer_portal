import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { OverrideQuotePricesDto } from './override-quote-prices.dto.js';

describe('quote fee editing DTO', () => {
  const fee = { chargeName: '文件费', chargeBasis: 'PER_BL', currency: 'USD', quantity: '1', unitPrice: '35.1234', costAmount: '20' };
  it('accepts a new fee without an existing item ID and trims its name', async () => {
    const dto = plainToInstance(OverrideQuotePricesDto, { reason: '新增文件费用', items: [{ ...fee, chargeName: ' 文件费 ' }] });
    expect(await validate(dto)).toHaveLength(0);
    expect(dto.items[0]?.chargeName).toBe('文件费');
  });
  it.each([
    { chargeName: '   ' }, { unitPrice: '-1' }, { unitPrice: '1.12345' },
    { quantity: 'NaN' }, { costAmount: '-2' }, { chargeBasis: 'OTHER' }, { currency: '人民币' },
  ])('rejects malformed fee fields %s', async (patch) => {
    const dto = plainToInstance(OverrideQuotePricesDto, { reason: '新增费用', items: [{ ...fee, ...patch }] });
    expect((await validate(dto)).length).toBeGreaterThan(0);
  });
  it('rejects a whitespace-only adjustment reason', async () => {
    const dto = plainToInstance(OverrideQuotePricesDto, { reason: '   ', items: [fee] });
    expect((await validate(dto)).map((error) => error.property)).toContain('reason');
  });
});
