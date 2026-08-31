import ExcelJS from 'exceljs';
import { previewRateImportWorkbook } from './rate-import-normalizer.js';

describe('rate import normalizer preview', () => {
  it('normalizes a mapped wide row and preserves source locations', async () => {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('客户运价');
    sheet.addRow(['说明']);
    sheet.addRow(['POL代码', 'POL名称', 'POD代码', 'POD名称', 'Carrier', '开始', '结束', '币种', '20GP成本', '20GP售价', '40HQ成本', '40HQ售价']);
    sheet.addRow(['cnsha', 'Shanghai', 'USLAX', 'Los Angeles', 'cosco', '2026-09-01', '2026-09-30', 'usd', 850, 980, 1250, 1400]);
    const buffer = Buffer.from(await workbook.xlsx.writeBuffer());

    const result = await previewRateImportWorkbook(buffer, {
      sheetName: '客户运价', headerRow: 2, headerDepth: 1,
      mappings: [
        ['polCode', 1], ['polName', 2], ['podCode', 3], ['podName', 4], ['carrierCode', 5], ['effectiveDate', 6],
        ['expiryDate', 7], ['currency', 8], ['price20GpCost', 9], ['price20GpSell', 10], ['price40HqCost', 11], ['price40HqSell', 12],
      ].map(([targetField, sourceColumn]) => ({ sourceColumn: Number(sourceColumn), sourceLabel: String(targetField), targetField: targetField as never })),
    });

    expect(result.summary).toMatchObject({ rateCount: 1, priceCount: 2, errorCount: 0, warningCount: 2 });
    expect(result.rates[0]).toMatchObject({
      source: { sheet: '客户运价', row: 3 }, polCode: 'CNSHA', polName: 'Shanghai', podCode: 'USLAX', podName: 'Los Angeles', carrierCode: 'COSCO',
      currency: 'USD', status: 'DRAFT', prices: [{ containerType: '20GP', costAmount: '850', sellAmount: '980' }, { containerType: '40HQ', sellAmount: '1400' }],
    });
  });

  it('returns field-level errors without dropping the preview row', async () => {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Rates');
    sheet.addRow(['POL', 'POD', 'Carrier', 'From', 'To', 'Currency', '20GP']);
    sheet.addRow(['Shanghai', 'Los Angeles', '', '2026-09-30', '2026-09-01', 'US', '850/900']);
    const buffer = Buffer.from(await workbook.xlsx.writeBuffer());
    const result = await previewRateImportWorkbook(buffer, {
      sheetName: 'Rates', headerRow: 1, headerDepth: 1,
      mappings: [
        ['polName', 1], ['podName', 2], ['carrierCode', 3], ['effectiveDate', 4], ['expiryDate', 5], ['currency', 6], ['price20GpCost', 7],
      ].map(([targetField, sourceColumn]) => ({ sourceColumn: Number(sourceColumn), sourceLabel: String(targetField), targetField: targetField as never })),
    });
    expect(result.rates).toHaveLength(1);
    expect(result.issues.some((issue) => issue.code === 'RATE_IMPORT_REQUIRED' && issue.source.row === 2 && issue.source.field === 'carrierCode')).toBe(true);
    expect(result.issues.some((issue) => issue.code === 'RATE_IMPORT_DATE_RANGE_INVALID')).toBe(true);
    expect(result.issues.some((issue) => issue.code === 'RATE_IMPORT_CURRENCY_INVALID')).toBe(true);
    expect(result.issues.some((issue) => issue.code === 'RATE_IMPORT_AMOUNT_INVALID' && issue.source.column === 7)).toBe(true);
  });

  it('merges legacy long rows by rate number and rejects duplicate container types', async () => {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Legacy');
    sheet.addRow(['Rate', 'POL', 'POL Name', 'POD', 'POD Name', 'Carrier', 'From', 'To', 'Currency', 'Status', 'Type', 'Cost']);
    sheet.addRow(['RATE-001', 'CNSHA', 'Shanghai', 'USLAX', 'Los Angeles', 'COSCO', '2026-09-01', '2026-09-30', 'USD', 'ACTIVE', '20GP', 850]);
    sheet.addRow(['RATE-001', 'CNSHA', 'Shanghai', 'USLAX', 'Los Angeles', 'COSCO', '2026-09-01', '2026-09-30', 'USD', 'ACTIVE', '40HQ', 1250]);
    sheet.addRow(['RATE-001', 'CNSHA', 'Shanghai', 'USLAX', 'Los Angeles', 'COSCO', '2026-09-01', '2026-09-30', 'USD', 'ACTIVE', '40HQ', 1300]);
    const buffer = Buffer.from(await workbook.xlsx.writeBuffer());
    const result = await previewRateImportWorkbook(buffer, {
      sheetName: 'Legacy', headerRow: 1, headerDepth: 1,
      mappings: [
        ['rateNo', 1], ['polCode', 2], ['polName', 3], ['podCode', 4], ['podName', 5], ['carrierCode', 6], ['effectiveDate', 7],
        ['expiryDate', 8], ['currency', 9], ['status', 10], ['containerType', 11], ['costAmount', 12],
      ].map(([targetField, sourceColumn]) => ({ sourceColumn: Number(sourceColumn), sourceLabel: String(targetField), targetField: targetField as never })),
    });
    expect(result.summary).toMatchObject({ rateCount: 1, priceCount: 2, errorCount: 1 });
    expect(result.rates[0]?.sourceRows).toEqual([2, 3, 4]);
    expect(result.issues.some((issue) => issue.code === 'RATE_IMPORT_CONTAINER_DUPLICATE' && issue.source.row === 4)).toBe(true);
  });
});
