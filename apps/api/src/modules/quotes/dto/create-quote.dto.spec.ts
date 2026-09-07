import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateQuoteDto } from './create-quote.dto.js';

describe('CreateQuoteDto cargo items', () => {
  it('accepts multiple valid cargo items', async () => {
    const dto = plainToInstance(CreateQuoteDto, {
      rateId: 'rate-1',
      containerType: '40HQ',
      containerQuantity: 1,
      incoterm: 'fob',
      cargoItems: [
        {
          commodity: 'Furniture',
          estimatedGrossWeight: 18000,
          cargoNature: 'General cargo',
          specialRequirement: 'Keep dry',
        },
        { commodity: 'Garments' },
      ],
      requestedServices: ['ORIGIN_PICKUP', 'EXPORT_CUSTOMS'],
      pickupLocationText: 'Shanghai',
      exportCustomsRemark: 'Documents pending',
      customerRemarks: 'Please confirm free time',
    });

    await expect(validate(dto)).resolves.toHaveLength(0);
    expect(dto.incoterm).toBe('FOB');
  });

  it('requires at least one complete cargo item', async () => {
    const empty = plainToInstance(CreateQuoteDto, {
      rateId: 'rate-1',
      containerType: '40HQ',
      containerQuantity: 1,
      cargoItems: [],
      requestedServices: [],
    });
    const invalid = plainToInstance(CreateQuoteDto, {
      rateId: 'rate-1',
      containerType: '40HQ',
      containerQuantity: 1,
      cargoItems: [{ commodity: '', estimatedGrossWeight: 0 }],
      requestedServices: [],
    });

    const emptyErrors = await validate(empty);
    const invalidErrors = await validate(invalid);
    expect(emptyErrors.some((error) => error.property === 'cargoItems')).toBe(true);
    expect(
      invalidErrors.find((error) => error.property === 'cargoItems')?.children,
    ).not.toHaveLength(0);
  });

  it('requires locations only while the matching transport service is selected', async () => {
    const selectedWithoutLocations = plainToInstance(CreateQuoteDto, {
      rateId: 'rate-1',
      containerType: '40HQ',
      containerQuantity: 1,
      cargoItems: [{ commodity: 'Furniture' }],
      requestedServices: ['ORIGIN_PICKUP', 'DESTINATION_DELIVERY'],
    });
    const deselectedWithoutLocations = plainToInstance(CreateQuoteDto, {
      rateId: 'rate-1',
      containerType: '40HQ',
      containerQuantity: 1,
      cargoItems: [{ commodity: 'Furniture' }],
      requestedServices: [],
    });

    const selectedErrors = await validate(selectedWithoutLocations);
    await expect(validate(deselectedWithoutLocations)).resolves.toHaveLength(0);
    expect(selectedErrors.map((error) => error.property)).toEqual(
      expect.arrayContaining(['pickupLocationText', 'deliveryLocationText']),
    );
  });
});
