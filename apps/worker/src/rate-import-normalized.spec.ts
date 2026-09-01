import { normalizedPreviewRows } from './rate-import.processor.js';

describe('confirmed normalized rate import payload', () => {
  it('converts a server-side preview into worker rows', () => {
    const result = normalizedPreviewRows([{
      source: { sheet: 'Rates', row: 2 }, sourceRows: [2], rateNo: 'RATE-001',
      polCode: 'CNSHA', polName: 'Shanghai', podCode: 'USLAX', podName: 'Los Angeles', carrierCode: 'COSCO',
      effectiveDate: '2026-09-01', expiryDate: '2026-09-30', currency: 'USD', status: 'ACTIVE',
      prices: [{ containerType: '20GP', costAmount: '850', sellAmount: '980', currency: 'USD', sourceColumns: [10, 11] }],
    }], 1);
    expect(result.errors).toEqual([]);
    expect(result.rows[0]).toMatchObject({ rateNo: 'RATE-001', containerType: '20GP', costAmount: '850', priceCurrency: 'USD' });
  });

  it('keeps parsed surcharge rows on the first generated worker row for a rate', () => {
    const result = normalizedPreviewRows([{
      source: { sheet: 'Rates', row: 4 }, sourceRows: [4], rateNo: 'RATE-CHARGE',
      polCode: 'CNSZX', polName: 'Shenzhen', podCode: 'SGSIN', podName: 'Singapore', carrierCode: 'PIL',
      effectiveDate: '2026-09-01', expiryDate: '2026-09-30', currency: 'USD', status: 'ACTIVE',
      prices: [
        { containerType: '20GP', costAmount: '400', currency: 'USD', sourceColumns: [8] },
        { containerType: '40GP', costAmount: '680', currency: 'USD', sourceColumns: [9] },
      ],
      charges: [
        { chargeCode: 'BAF', chargeName: 'BAF', chargeBasis: 'PER_CONTAINER', amount: '50', currency: 'USD', isIncluded: false, sourceColumn: 11 },
        { chargeCode: 'DOC', chargeName: 'Documentation Fee', chargeBasis: 'PER_BL', amount: '50', currency: 'USD', isIncluded: false, sourceColumn: 13 },
      ],
    }], 1);

    expect(result.errors).toEqual([]);
    expect(result.rows[0]?.charges).toHaveLength(2);
    expect(result.rows[1]?.charges).toEqual([]);
  });

  it('rejects missing required normalized fields defensively', () => {
    const result = normalizedPreviewRows([{
      source: { sheet: 'Rates', row: 7 }, sourceRows: [7], status: 'ACTIVE',
      prices: [{ containerType: '40HQ', costAmount: '1250', currency: 'USD', sourceColumns: [8] }],
    }]);
    expect(result.errors.some((error) => error.row === 7 && error.field === 'polCode')).toBe(true);
  });
});
