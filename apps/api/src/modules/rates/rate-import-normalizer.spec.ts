import ExcelJS from 'exceljs';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { analyzeRateImportWorkbook } from './rate-import-workbook-analyzer.js';
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

    expect(result.summary).toMatchObject({ rateCount: 1, priceCount: 2, errorCount: 0, warningCount: 0 });
    expect(result.rates[0]).toMatchObject({
      source: { sheet: '客户运价', row: 3 }, polCode: 'CNSHA', polName: 'Shanghai', podCode: 'USLAX', podName: 'Los Angeles', carrierCode: 'COSCO',
      currency: 'USD', status: 'DRAFT', prices: [{ containerType: '20GP', costAmount: '850', sellAmount: '980' }, { containerType: '40HQ', costAmount: '1250', sellAmount: '1400' }],
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

  it('applies one-time validity and currency fixes and normalizes common port names', async () => {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Rates');
    sheet.addRow(['Origin', 'Destination', 'Carrier', '40HC']);
    sheet.addRow(['Shenzhen', 'Singapore', 'PIL', 720]);
    const buffer = Buffer.from(await workbook.xlsx.writeBuffer());

    const result = await previewRateImportWorkbook(buffer, {
      sheetName: 'Rates', headerRow: 1, headerDepth: 1,
      mappings: [
        ['polName', 1], ['podName', 2], ['carrierCode', 3], ['price40HqCost', 4],
      ].map(([targetField, sourceColumn]) => ({ sourceColumn: Number(sourceColumn), sourceLabel: String(targetField), targetField: targetField as never })),
      defaults: { effectiveDate: '2026-09-01', expiryDate: '2026-09-30', currency: 'USD' },
    });

    expect(result.summary).toMatchObject({ rateCount: 1, priceCount: 1, errorCount: 0 });
    expect(result.rates[0]).toMatchObject({
      polCode: 'CNSZX',
      podCode: 'SGSIN',
      carrierCode: 'PIL',
      effectiveDate: '2026-09-01',
      expiryDate: '2026-09-30',
      currency: 'USD',
      prices: [expect.objectContaining({ containerType: '40HQ', costAmount: '720' })],
    });
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

  it('previews Case 01 standard English FCL as five rates and fifteen container prices without required issues', async () => {
    const file = resolve(__dirname, '../../../../../docs/07-sample-data/01_standard_english_FCL.xlsx');
    const buffer = await readFile(file);
    const analysis = await analyzeRateImportWorkbook('01_standard_english_FCL.xlsx', buffer);
    const sheet = analysis.sheets[0];
    const candidate = sheet?.headerCandidates[0];
    expect(sheet?.name).toBe('FCL Rates');
    expect(candidate).toMatchObject({ row: 1, depth: 1 });

    const result = await previewRateImportWorkbook(buffer, {
      sheetName: sheet!.name,
      headerRow: candidate!.row,
      headerDepth: candidate!.depth,
      mappings: candidate!.suggestions.map((suggestion) => ({
        sourceColumn: suggestion.column,
        sourceLabel: suggestion.sourceLabel,
        targetField: suggestion.targetField,
      })),
    });

    expect(result.summary).toEqual({ rateCount: 5, priceCount: 15, chargeCount: 0, errorCount: 0, warningCount: 0 });
    expect(result.issues).toHaveLength(0);
    expect(result.rates).toHaveLength(5);
    expect(result.rates[0]).toMatchObject({
      polCode: 'CNSZX',
      podCode: 'SGSIN',
      carrierCode: 'PIL',
      effectiveDate: '2026-09-01',
      expiryDate: '2026-09-30',
      currency: 'USD',
      prices: [
        { containerType: '20GP', costAmount: '420', currency: 'USD' },
        { containerType: '40GP', costAmount: '720', currency: 'USD' },
        { containerType: '40HQ', costAmount: '720', currency: 'USD' },
      ],
    });
    expect(result.rates.map((rate) => rate.podCode)).toEqual(['SGSIN', 'MYPKG', 'THBKK', 'VNSGN', 'IDJKT']);
    expect(result.rates.flatMap((rate) => rate.prices).every((price) => price.currency === 'USD')).toBe(true);
    expect(result.rates.flatMap((rate) => rate.prices).map((price) => `${price.containerType}:${price.costAmount}`)).toEqual([
      '20GP:420', '40GP:720', '40HQ:720',
      '20GP:450', '40GP:750', '40HQ:750',
      '20GP:530', '40GP:850', '40HQ:850',
      '20GP:390', '40GP:640', '40HQ:640',
      '20GP:610', '40GP:990', '40HQ:990',
    ]);
  });

  it('previews Case 02 Chinese FCL with global validity and currency metadata', async () => {
    const file = resolve(__dirname, '../../../../../docs/07-sample-data/02_chinese_headers_global_validity.xlsx');
    const buffer = await readFile(file);
    const analysis = await analyzeRateImportWorkbook('02_chinese_headers_global_validity.xlsx', buffer);
    const sheet = analysis.sheets[0];
    const candidate = sheet?.headerCandidates[0];
    expect(sheet?.name).toBe('东南亚FCL特价');
    expect(candidate).toMatchObject({ row: 4, depth: 1 });

    const result = await previewRateImportWorkbook(buffer, {
      sheetName: sheet!.name,
      headerRow: candidate!.row,
      headerDepth: candidate!.depth,
      mappings: candidate!.suggestions.map((suggestion) => ({
        sourceColumn: suggestion.column,
        sourceLabel: suggestion.sourceLabel,
        targetField: suggestion.targetField,
      })),
    });

    expect(result.summary).toEqual({ rateCount: 5, priceCount: 16, chargeCount: 0, errorCount: 0, warningCount: 0 });
    expect(result.issues).toHaveLength(0);
    expect(result.rates).toHaveLength(5);
    expect(result.rates.every((rate) => rate.effectiveDate === '2026-09-01')).toBe(true);
    expect(result.rates.every((rate) => rate.expiryDate === '2026-09-20')).toBe(true);
    expect(result.rates.every((rate) => rate.currency === 'USD')).toBe(true);
    expect(result.rates.map((rate) => rate.polCode)).toEqual(['CNSZX', 'CNSZX', 'CNNGB', 'CNSHA', 'CNXMN']);
    expect(result.rates.map((rate) => rate.podCode)).toEqual(['SGSIN', 'MYPKG', 'THBKK', 'VNSGN', 'IDJKT']);
    expect(result.rates.map((rate) => rate.transitDays)).toEqual([4, 5, 8, 6, 10]);
    expect(result.rates[0]?.prices).toEqual([
      { containerType: '20GP', costAmount: '420', sellAmount: undefined, currency: 'USD', sourceColumns: [7] },
      { containerType: '40GP', costAmount: '720', sellAmount: undefined, currency: 'USD', sourceColumns: [8] },
      { containerType: '40HQ', costAmount: '720', sellAmount: undefined, currency: 'USD', sourceColumns: [9] },
    ]);
    expect(result.rates[4]?.prices).toEqual([
      { containerType: '20GP', costAmount: '610', sellAmount: undefined, currency: 'USD', sourceColumns: [7] },
      { containerType: '40GP', costAmount: '990', sellAmount: undefined, currency: 'USD', sourceColumns: [8] },
      { containerType: '40HQ', costAmount: '990', sellAmount: undefined, currency: 'USD', sourceColumns: [9] },
      { containerType: '45HQ', costAmount: '1190', sellAmount: undefined, currency: 'USD', sourceColumns: [10] },
    ]);
    expect(result.issues.some((issue) => issue.source.field === 'vesselVoyage' || issue.source.field === 'etd')).toBe(false);
  });

  describe('excel import fixture regression matrix', () => {
    const cases = [
      ['01_standard_english_FCL.xlsx', 5, 15, 0, 0],
      ['02_chinese_headers_global_validity.xlsx', 5, 16, 0, 0],
      ['03_alias_headers_20DC_40HC.xlsx', 4, 15, 0, 0],
      ['04_header_row5_with_metadata.xlsx', 4, 12, 0, 0],
      ['06_port_alias_and_abbreviation.xlsx', 5, 15, 0, 0],
      ['07_surcharge_columns_agent_rate.xlsx', 4, 12, 13, 0],
      ['08_messy_CN_alias_mixed_dates.xlsx', 4, 12, 0, 0],
    ] as const;

    it.each(cases)('%s previews with generalized import rules', async (fileName, rateCount, priceCount, chargeCount, errorCount) => {
      const result = await previewFixture(fileName);

      expect(result.summary).toMatchObject({ rateCount, priceCount, chargeCount, errorCount });
      expect(result.issues.filter((issue) => issue.severity === 'ERROR')).toHaveLength(errorCount);
      expect(result.rates.every((rate) => rate.polCode && rate.podCode && rate.carrierCode)).toBe(true);
      expect(result.rates.every((rate) => rate.effectiveDate && rate.expiryDate && rate.currency)).toBe(true);
    });

    it('keeps Case 05 in the fallback flow until validity and currency are supplied', async () => {
      const before = await previewFixture('05_missing_validity_and_currency.xlsx');

      expect(before.summary).toMatchObject({ rateCount: 5, priceCount: 15, chargeCount: 0, errorCount: 1 });
      expect(before.issues.every((issue) => !['polCode', 'podCode', 'carrierCode', 'etd', 'vesselVoyage'].includes(issue.source.field ?? ''))).toBe(true);

      const after = await previewFixture('05_missing_validity_and_currency.xlsx', {
        effectiveDate: '2026-09-01',
        expiryDate: '2026-09-30',
        currency: 'USD',
      });

      expect(after.summary).toMatchObject({ rateCount: 5, priceCount: 15, chargeCount: 0, errorCount: 0 });
      expect(after.rates.every((rate) => rate.effectiveDate === '2026-09-01' && rate.expiryDate === '2026-09-30' && rate.currency === 'USD')).toBe(true);
    });

    it('normalizes aliases in Case 03 without dropping 45HQ prices', async () => {
      const result = await previewFixture('03_alias_headers_20DC_40HC.xlsx');

      expect(result.rates.map((rate) => rate.polCode)).toEqual(['CNSZX', 'CNNGB', 'CNSHA', 'CNXMN']);
      expect(result.rates.map((rate) => rate.podCode)).toEqual(['USLAX', 'USLGB', 'USNYC', 'USSAV']);
      expect(result.rates.every((rate) => rate.carrierCode === 'MAEU')).toBe(true);
      expect(result.rates.flatMap((rate) => rate.prices).filter((price) => price.containerType === '45HQ')).toHaveLength(3);
    });

    it('normalizes mixed Chinese dates and currency aliases in Case 08 using quotation-date context', async () => {
      const result = await previewFixture('08_messy_CN_alias_mixed_dates.xlsx');

      expect(result.rates.every((rate) => rate.currency === 'USD')).toBe(true);
      expect(result.rates.map((rate) => `${rate.effectiveDate}/${rate.expiryDate}`)).toEqual([
        '2026-09-01/2026-09-20',
        '2026-09-01/2026-09-20',
        '2026-09-01/2026-09-20',
        '2026-09-01/2026-09-20',
      ]);
      expect(result.rates.every((rate) => rate.remark?.includes('Free time:'))).toBe(true);
    });
  });
});

async function previewFixture(fileName: string, defaults?: { effectiveDate?: string; expiryDate?: string; currency?: string }) {
  const file = resolve(__dirname, '../../../../../excel-import-fixtures', fileName);
  const buffer = await readFile(file);
  const analysis = await analyzeRateImportWorkbook(fileName, buffer);
  const sheet = analysis.sheets[0];
  const candidate = sheet?.headerCandidates[0];
  if (!sheet || !candidate) throw new Error(`No import header detected for ${fileName}`);
  return previewRateImportWorkbook(buffer, {
    sheetName: sheet.name,
    headerRow: candidate.row,
    headerDepth: candidate.depth,
    mappings: candidate.suggestions.map((suggestion) => ({
      sourceColumn: suggestion.column,
      sourceLabel: suggestion.sourceLabel,
      targetField: suggestion.targetField,
    })),
    defaults,
  });
}
