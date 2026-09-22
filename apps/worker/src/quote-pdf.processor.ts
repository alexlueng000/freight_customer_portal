import { PutObjectCommand, type S3Client } from '@aws-sdk/client-s3';
import PDFDocument from 'pdfkit';
import { fileURLToPath } from 'node:url';

const quoteFontPath = fileURLToPath(new URL('../assets/fonts/NotoSansCJKsc-Regular.otf', import.meta.url));

export const QUOTE_PDF_QUEUE = 'quote-pdfs';
export const QUOTE_PDF_JOB = 'generate-quote-pdf';

export interface QuotePdfJobData {
  tenantId: string;
  quoteId: string;
  version: number;
  objectKey: string;
  quote: {
    quoteNo: string;
    status: string;
    polCode: string;
    podCode: string;
    carrierCode: string | null;
    etd: string | null;
    validUntil: string;
    currency: string;
    totalAmount: string;
    amountsByCurrency?: Record<string, string>;
    customerTerms: string | null;
    version: number;
    customerName: string;
    items: Array<{
      chargeCode: string;
      chargeName: string;
      containerType: string | null;
      quantity: string;
      unitPrice: string;
      amount: string;
      currency: string;
    }>;
  };
}

export async function processQuotePdf(s3: S3Client, bucket: string, data: QuotePdfJobData) {
  const pdf = await generateQuotePdf(data.quote);
  await s3.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: data.objectKey,
      Body: pdf,
      ContentType: 'application/pdf',
      Metadata: { tenantId: data.tenantId, quoteId: data.quoteId, version: String(data.version) },
    }),
  );
  return { objectKey: data.objectKey, size: pdf.length };
}

export function quotePdfTotals(quote: Pick<QuotePdfJobData['quote'], 'currency' | 'totalAmount' | 'amountsByCurrency'>): Array<[string, string]> {
  const totals = Object.entries(quote.amountsByCurrency ?? {});
  return totals.length ? totals : [[quote.currency, quote.totalAmount]];
}
export function generateQuotePdf(quote: QuotePdfJobData['quote']): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const pdf = new PDFDocument({
      size: 'A4',
      margins: { top: 48, right: 48, bottom: 72, left: 48 },
      bufferPages: true,
      info: { Title: `Quote ${quote.quoteNo}` },
    });
    const chunks: Buffer[] = [];
    pdf.on('data', (chunk: Buffer) => chunks.push(chunk));
    pdf.on('end', () => resolve(Buffer.concat(chunks)));
    pdf.on('error', reject);
    // Bundle and embed the font so Chinese works on both Windows and the minimal Linux worker.
    pdf.registerFont('QuoteCJK', quoteFontPath);
    pdf.rect(0, 0, 595.28, 86).fill('#17324D');
    pdf.fillColor('#FFFFFF').font('Helvetica-Bold').fontSize(24).text('FREIGHT QUOTATION', 48, 31);
    pdf
      .font('QuoteCJK')
      .fontSize(9)
      .text(`Version ${quote.version}`, 470, 40, { width: 76, align: 'right' });
    pdf.fillColor('#17212B').font('Helvetica-Bold').fontSize(14).text(quote.quoteNo, 48, 112);
    pdf
      .font('QuoteCJK')
      .fontSize(9)
      .fillColor('#5B6570')
      .text(`Status: ${quote.status}`, 48, 135)
      .text(`Valid until: ${date(quote.validUntil)}`, 360, 112, { width: 187, align: 'right' })
      .text(`Created for: ${quote.customerName}`, 300, 135, { width: 247, align: 'right' });
    pdf.moveTo(48, 164).lineTo(547, 164).strokeColor('#D7DEE5').stroke();
    pdf.fillColor('#17212B').font('Helvetica-Bold').fontSize(11).text('ROUTE', 48, 184);
    pdf
      .font('QuoteCJK')
      .fontSize(10)
      .text(`${quote.polCode}  ->  ${quote.podCode}`, 48, 205)
      .text(`Carrier: ${quote.carrierCode ?? 'TBC'}`, 300, 205)
      .text(`ETD: ${quote.etd ? date(quote.etd) : 'TBC'}`, 420, 205);
    const top = 250;
    const x = [48, 255, 335, 390, 475];
    const widths = [207, 80, 55, 85, 72];
    const tableHeader = (at: number) => {
      pdf.rect(48, at, 499, 26).fill('#E9EEF3');
      pdf.fillColor('#17324D').font('Helvetica-Bold').fontSize(8);
      ['CHARGE', 'CONTAINER', 'QTY', 'UNIT PRICE', 'AMOUNT'].forEach((label, i) =>
        pdf.text(label, x[i], at + 9, { width: widths[i]!, align: i >= 2 ? 'right' : 'left' }),
      );
      pdf.font('QuoteCJK').fontSize(8.5);
      return at + 26;
    };
    let y = tableHeader(top);
    for (const item of quote.items) {
      // Customer documents show business names, not internal codes such as MANUAL_CHARGE.
      const cells = [item.chargeName, item.containerType ?? '-', Number(item.quantity).toFixed(2),
        item.currency + ' ' + money(item.unitPrice), item.currency + ' ' + money(item.amount)];
      const rowHeight = Math.max(30, ...cells.map((text, i) =>
        pdf.heightOfString(text, { width: widths[i]! - 8, lineGap: 2 }) + 16));
      if (y + rowHeight > 760) {
        pdf.addPage();
        y = tableHeader(48);
      }
      pdf.rect(48, y, 499, rowHeight).fillAndStroke('#FFFFFF', '#E4E9EE');
      pdf.fillColor('#17212B');
      cells.forEach((text, i) => pdf.text(text, x[i]! + 4, y + 8, {
        width: widths[i]! - 8, lineGap: 2, align: i >= 2 ? 'right' : 'left',
      }));
      y += rowHeight;
    }
    const totals = quotePdfTotals(quote);
    for (const [currency, total] of totals) {
    if (y + 60 > 760) {
      pdf.addPage();
      y = 48;
    }
    pdf.rect(335, y + 12, 212, 42).fill('#17324D');
    pdf
      .fillColor('#FFFFFF')
      .font('Helvetica-Bold')
      .fontSize(10)
      .text('TOTAL', 350, y + 28)
      .fontSize(13)
      .text(`${currency} ${money(total)}`, 405, y + 25, {
        width: 127,
        align: 'right',
      });
    y += 54;
    }
    if (quote.customerTerms?.trim()) {
      y += 78;
      if (y > 690) {
        pdf.addPage();
        y = 60;
      }
      pdf
        .fillColor('#17212B')
        .font('Helvetica-Bold')
        .fontSize(10)
        .text('TERMS', 48, y);
      pdf
        .fillColor('#5B6570')
        .font('QuoteCJK')
        .fontSize(8.5)
        .text(quote.customerTerms.trim(), 48, y + 18, { width: 499, lineGap: 3 });
    }
    const pages = pdf.bufferedPageRange();
    for (let page = pages.start; page < pages.start + pages.count; page += 1) {
      pdf.switchToPage(page);
      const bottom = pdf.page.margins.bottom;
      pdf.page.margins.bottom = 20;
      pdf.fillColor('#5B6570').font('QuoteCJK').fontSize(8)
        .text('Generated from a preserved rate and price snapshot.', 48, 790, { width: 499, align: 'center' });
      pdf.page.margins.bottom = bottom;
    }
    pdf.end();
  });
}
function date(value: string) {
  return new Date(value).toISOString().slice(0, 10);
}
function money(value: string) {
  return new Intl.NumberFormat('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number(value));
}
