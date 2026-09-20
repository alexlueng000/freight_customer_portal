import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateQuoteDto } from './create-quote.dto.js';

describe('CreateQuoteDto cargo items', () => {
  const baseRequest = {
    rateId: 'rate-1', containerType: '40HQ', containerQuantity: 1,
    cargoItems: [{ commodity: 'Furniture' }], requestedServices: [],
    pickupLocationText: '上海工厂', deliveryLocationText: '洛杉矶仓库',
  };

  it.each([undefined, null, '2024-02-29', '2026-09-25', '2030-12-31'])('accepts optional factory loading date %s', async (factoryLoadingDate) => {
    await expect(validate(plainToInstance(CreateQuoteDto, { ...baseRequest, factoryLoadingDate }))).resolves.toHaveLength(0);
  });

  it.each(['', ' ', '2026-02-30', '2025-02-29', '2026-13-01', '0000-01-01', '2026-9-1', '2026-09-25T12:00:00Z', 20260925])('rejects invalid factory loading date %s', async (factoryLoadingDate) => {
    const errors = await validate(plainToInstance(CreateQuoteDto, { ...baseRequest, factoryLoadingDate }));
    expect(errors.map((error) => error.property)).toContain('factoryLoadingDate');
  });

  it.each([undefined, null, '', '   ', '\t\n'])('rejects missing or blank locations without selecting services %s', async (location) => {
    const errors = await validate(plainToInstance(CreateQuoteDto, {
      ...baseRequest,
      pickupLocationText: location, deliveryLocationText: location,
    }));
    expect(errors.map((error) => error.property)).toEqual(expect.arrayContaining(['pickupLocationText', 'deliveryLocationText']));
  });

  it.each([
    ['ORIGIN_PICKUP', 'pickupLocationText'], ['DESTINATION_DELIVERY', 'deliveryLocationText'],
  ])('preserves required locations when %s is selected and trims them', async (service, field) => {
    const dto = plainToInstance(CreateQuoteDto, { ...baseRequest, requestedServices: [service], [field]: '  上海仓库  ' });
    await expect(validate(dto)).resolves.toHaveLength(0);
    expect(dto[field as 'pickupLocationText' | 'deliveryLocationText']).toBe('上海仓库');
  });

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
      deliveryLocationText: 'Los Angeles',
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

  it('requires both locations with and without transport services', async () => {
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
    const deselectedErrors = await validate(deselectedWithoutLocations);
    expect(deselectedErrors.map((error) => error.property)).toEqual(expect.arrayContaining(['pickupLocationText', 'deliveryLocationText']));
    expect(selectedErrors.map((error) => error.property)).toEqual(
      expect.arrayContaining(['pickupLocationText', 'deliveryLocationText']),
    );
  });
});
