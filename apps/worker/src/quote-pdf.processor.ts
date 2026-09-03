import { PutObjectCommand, type S3Client } from '@aws-sdk/client-s3';
import PDFDocument from 'pdfkit';

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

export function generateQuotePdf(quote: QuotePdfJobData['quote']): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const pdf = new PDFDocument({
      size: 'A4',
      margins: { top: 48, right: 48, bottom: 48, left: 48 },
      info: { Title: `Quote ${quote.quoteNo}` },
    });
    const chunks: Buffer[] = [];
    pdf.on('data', (chunk: Buffer) => chunks.push(chunk));
    pdf.on('end', () => resolve(Buffer.concat(chunks)));
    pdf.on('error', reject);
    pdf.rect(0, 0, 595.28, 86).fill('#17324D');
    pdf.fillColor('#FFFFFF').font('Helvetica-Bold').fontSize(24).text('FREIGHT QUOTATION', 48, 31);
    pdf
      .font('Helvetica')
      .fontSize(9)
      .text(`Version ${quote.version}`, 470, 40, { width: 76, align: 'right' });
    pdf.fillColor('#17212B').font('Helvetica-Bold').fontSize(14).text(quote.quoteNo, 48, 112);
    pdf
      .font('Helvetica')
      .fontSize(9)
      .fillColor('#5B6570')
      .text(`Status: ${quote.status}`, 48, 135)
      .text(`Valid until: ${date(quote.validUntil)}`, 360, 112, { width: 187, align: 'right' })
      .text(`Created for: ${quote.customerName}`, 300, 135, { width: 247, align: 'right' });
    pdf.moveTo(48, 164).lineTo(547, 164).strokeColor('#D7DEE5').stroke();
    pdf.fillColor('#17212B').font('Helvetica-Bold').fontSize(11).text('ROUTE', 48, 184);
    pdf
      .font('Helvetica')
      .fontSize(10)
      .text(`${quote.polCode}  ->  ${quote.podCode}`, 48, 205)
      .text(`Carrier: ${quote.carrierCode ?? 'TBC'}`, 300, 205)
      .text(`ETD: ${quote.etd ? date(quote.etd) : 'TBC'}`, 420, 205);
    const top = 250;
    const x = [48, 255, 335, 390, 475];
    const widths = [207, 80, 55, 85, 72];
    pdf.rect(48, top, 499, 26).fill('#E9EEF3');
    pdf.fillColor('#17324D').font('Helvetica-Bold').fontSize(8);
    ['CHARGE', 'CONTAINER', 'QTY', 'UNIT PRICE', 'AMOUNT'].forEach((label, i) =>
      pdf.text(label, x[i], top + 9, { width: widths[i]!, align: i >= 2 ? 'right' : 'left' }),
    );
    let y = top + 26;
    pdf.font('Helvetica').fontSize(8.5);
    for (const item of quote.items) {
      if (y > 720) {
        pdf.addPage();
        y = 60;
      }
      pdf.rect(48, y, 499, 30).fillAndStroke('#FFFFFF', '#E4E9EE');
      pdf
        .fillColor('#17212B')
        .text(`${item.chargeName} (${item.chargeCode})`, x[0], y + 10, { width: widths[0]! })
        .text(item.containerType ?? '-', x[1], y + 10, { width: widths[1]! })
        .text(Number(item.quantity).toFixed(2), x[2], y + 10, { width: widths[2]!, align: 'right' })
        .text(`${item.currency} ${money(item.unitPrice)}`, x[3], y + 10, {
          width: widths[3]!,
          align: 'right',
        })
        .text(`${item.currency} ${money(item.amount)}`, x[4], y + 10, {
          width: widths[4]!,
          align: 'right',
        });
      y += 30;
    }
    pdf.rect(335, y + 12, 212, 42).fill('#17324D');
    pdf
      .fillColor('#FFFFFF')
      .font('Helvetica-Bold')
      .fontSize(10)
      .text('TOTAL', 350, y + 28)
      .fontSize(13)
      .text(`${quote.currency} ${money(quote.totalAmount)}`, 405, y + 25, {
        width: 127,
        align: 'right',
      });
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
        .font('Helvetica')
        .fontSize(8.5)
        .text(quote.customerTerms.trim(), 48, y + 18, { width: 499, lineGap: 3 });
    }
    pdf
      .fillColor('#5B6570')
      .font('Helvetica')
      .fontSize(8)
      .text('Generated from a preserved rate and price snapshot.', 48, 790, {
        width: 499,
        align: 'center',
      });
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
