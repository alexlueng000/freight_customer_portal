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

  it('rejects missing required normalized fields defensively', () => {
    const result = normalizedPreviewRows([{
      source: { sheet: 'Rates', row: 7 }, sourceRows: [7], status: 'ACTIVE',
      prices: [{ containerType: '40HQ', costAmount: '1250', currency: 'USD', sourceColumns: [8] }],
    }]);
    expect(result.errors.some((error) => error.row === 7 && error.field === 'polCode')).toBe(true);
  });
});
