import { generateQuotePdf } from './quote-pdf.processor.js';

describe('generateQuotePdf', () => {
  it('embeds a CJK font and Unicode mapping for Chinese quote content', async () => {
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
      customerTerms: '本次报价费用项目：海运费（按箱 / 40HQ）、文件费（按提单）。报价有效期至：2026-09-30。',
      version: 1,
      customerName: '上海北星贸易有限公司 Northstar Trading',
      items: [
        {
          chargeCode: 'OCEAN_FREIGHT',
          chargeName: '海运费',
          containerType: '40HQ',
          quantity: '1',
          unitPrice: '1300',
          amount: '1300',
          currency: 'USD',
        },
        {
          chargeCode: 'DOC',
          chargeName: '文件费及本票货物的出口单证操作服务费用',
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
    const structure = pdf.toString('latin1');
    expect(structure).toContain('/FontFile3');
    expect(structure).toContain('/ToUnicode');
    expect(structure).toContain('NotoSansCJKsc');
  });
});
