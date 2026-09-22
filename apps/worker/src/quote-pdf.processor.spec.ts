import { generateQuotePdf } from './quote-pdf.processor.js';
import PDFDocument from 'pdfkit';
const jestApi = (import.meta as ImportMeta & { jest: typeof jest }).jest;

describe('generateQuotePdf', () => {
  it('embeds a CJK font and Unicode mapping for Chinese quote content', async () => {
    const text = jestApi.spyOn(PDFDocument.prototype, 'text');
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
      amountsByCurrency: { USD: '1360', CNY: '88' },
      customerTerms: '本次报价费用项目：海运费（按箱 / 40HQ）、文件费（按提单）。报价有效期至：2026-09-30。',
      version: 1,
      customerName: '上海北星贸易有限公司 Northstar Trading',
      items: [
        { chargeCode: 'MANUAL_CHARGE', chargeName: '人民币文件费', containerType: null, quantity: '1', unitPrice: '88', amount: '88', currency: 'CNY' },
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
    expect(text).toHaveBeenCalledWith('USD 1,360.00', 405, expect.any(Number), expect.any(Object));
    expect(text).toHaveBeenCalledWith('CNY 88.00', 405, expect.any(Number), expect.any(Object));
    text.mockRestore();
  });
});
