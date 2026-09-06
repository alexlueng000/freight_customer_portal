import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateQuoteDto } from './create-quote.dto.js';

describe('CreateQuoteDto cargo items', () => {
  it('accepts multiple valid cargo items', async () => {
    const dto = plainToInstance(CreateQuoteDto, {
      rateId: 'rate-1',
      containerType: '40HQ',
      quantity: 1,
      cargoItems: [
        { commodity: 'Furniture', grossWeightKg: 18000, specialRequirements: 'Keep dry' },
        { commodity: 'Garments', grossWeightKg: 2500 },
      ],
      requestedServices: ['ORIGIN_LOGISTICS'],
      pickupAddress: 'Shanghai',
    });

    await expect(validate(dto)).resolves.toHaveLength(0);
  });

  it('requires at least one complete cargo item', async () => {
    const empty = plainToInstance(CreateQuoteDto, {
      rateId: 'rate-1',
      containerType: '40HQ',
      quantity: 1,
      cargoItems: [],
      requestedServices: [],
    });
    const invalid = plainToInstance(CreateQuoteDto, {
      rateId: 'rate-1',
      containerType: '40HQ',
      quantity: 1,
      cargoItems: [{ commodity: '', grossWeightKg: 0 }],
      requestedServices: [],
    });

    const emptyErrors = await validate(empty);
    const invalidErrors = await validate(invalid);
    expect(emptyErrors.some((error) => error.property === 'cargoItems')).toBe(true);
    expect(
      invalidErrors.find((error) => error.property === 'cargoItems')?.children,
    ).not.toHaveLength(0);
  });
});
