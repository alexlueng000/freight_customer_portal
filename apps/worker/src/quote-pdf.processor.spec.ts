import { generateQuotePdf } from './quote-pdf.processor.js';

describe('generateQuotePdf', () => {
  it('generates a non-empty PDF from the preserved quote snapshot', async () => {
    const pdf = await generateQuotePdf({
      quoteNo: 'QT202608000001',
      status: 'SENT',
      polCode: 'CNSHA',
      podCode: 'USLAX',
      carrierCode: 'COSCO',
      etd: '2026-09-15T00:00:00.000Z',
      validUntil: '2026-09-30T00:00:00.000Z',
      currency: 'USD',
      totalAmount: '1360',
      version: 1,
      customerName: 'Northstar Trading',
      items: [
        {
          chargeCode: 'OCEAN_FREIGHT',
          chargeName: 'Ocean freight',
          containerType: '40HQ',
          quantity: '1',
          unitPrice: '1300',
          amount: '1300',
          currency: 'USD',
        },
        {
          chargeCode: 'DOC',
          chargeName: 'Document fee',
          containerType: null,
          quantity: '1',
          unitPrice: '60',
          amount: '60',
          currency: 'USD',
        },
      ],
    });
    expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');
    expect(pdf.length).toBeGreaterThan(1500);
  });
});
