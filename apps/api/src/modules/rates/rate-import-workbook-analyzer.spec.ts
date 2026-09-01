import { BadRequestException } from '@nestjs/common';
import ExcelJS from 'exceljs';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { analyzeRateImportWorkbook } from './rate-import-workbook-analyzer.js';

describe('rate import workbook analyzer', () => {
  it('detects a second-sheet, offset two-level header and wide container prices', async () => {
    const workbook = new ExcelJS.Workbook();
    workbook.addWorksheet('说明').addRow(['船司运价说明']);
    const sheet = workbook.addWorksheet('Ocean Freight');
    sheet.addRow(['2026 年 9 月美线运价']);
    sheet.addRow(['请注意：价格不含目的港费用']);
    sheet.addRow(['航线', '航线', '船司', '有效期', '有效期', '20GP', '20GP', '40HQ', '40HQ']);
    sheet.addRow(['起运港', '目的港', 'Carrier', '开始日期', '截止日期', '成本', '售价', '成本', '售价']);
    sheet.addRow(['上海', 'Los Angeles', 'COSCO', '2026-09-01', '2026-09-30', 850, 980, 1250, 1400]);
    sheet.mergeCells('A3:A4');
    sheet.getCell('A3').value = '起运港';
    const buffer = Buffer.from(await workbook.xlsx.writeBuffer());

    const result = await analyzeRateImportWorkbook('customer-rate.xlsx', buffer);

    expect(result.sheets).toHaveLength(2);
    const rateSheet = result.sheets[1];
    expect(rateSheet?.name).toBe('Ocean Freight');
    expect(rateSheet?.headerCandidates[0]).toMatchObject({ row: 4, depth: 2 });
    expect(rateSheet?.headerCandidates[0]?.suggestions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ targetField: 'polName' }),
        expect.objectContaining({ targetField: 'podName' }),
        expect.objectContaining({ targetField: 'price20GpCost' }),
        expect.objectContaining({ targetField: 'price40HqSell' }),
      ]),
    );
    expect(rateSheet?.sampleRows[0]).toMatchObject({ row: 5 });
  });

  it('rejects a damaged workbook with a stable business error', async () => {
    await expect(analyzeRateImportWorkbook('broken.xlsx', Buffer.from('not-xlsx'))).rejects.toMatchObject({
      response: { code: 'RATE_IMPORT_WORKBOOK_INVALID' },
    });
    await expect(analyzeRateImportWorkbook('broken.xlsx', Buffer.from('not-xlsx'))).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('suggests common customer aliases without requiring template headers', async () => {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Agent Quote');
    sheet.addRow(['Origin', 'Destination', 'Carrier', 'Validity', 'Valid To', 'USD Rate', "40'HC", '免箱期', '品名限制']);
    sheet.addRow(['Shenzhen', 'Singapore', 'PIL', '2026-09-01', '2026-09-30', 720, 720, '14 days', 'general cargo']);
    const buffer = Buffer.from(await workbook.xlsx.writeBuffer());

    const result = await analyzeRateImportWorkbook('agent.xlsx', buffer);
    const suggestions = result.sheets[0]?.headerCandidates[0]?.suggestions ?? [];

    expect(suggestions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ targetField: 'polName' }),
        expect.objectContaining({ targetField: 'podName' }),
        expect.objectContaining({ targetField: 'carrierCode' }),
        expect.objectContaining({ targetField: 'effectiveDate' }),
        expect.objectContaining({ targetField: 'expiryDate' }),
        expect.objectContaining({ targetField: 'currency' }),
        expect.objectContaining({ targetField: 'price40HqSell' }),
        expect.objectContaining({ targetField: 'freeTime' }),
        expect.objectContaining({ targetField: 'commodityRestriction' }),
      ]),
    );
  });

  it('reads the prefixed OpenXML used by the real freight sample workbook', async () => {
    const file = resolve(__dirname, '../../../../../docs/07-sample-data/真实货代Excel示例合集.xlsx');
    const result = await analyzeRateImportWorkbook(file, await readFile(file));

    expect(result.sheets).toHaveLength(7);
    expect(result.sheets.find((sheet) => sheet.name === '美西FCL周价')).toMatchObject({
      columnCount: 18,
    });
    expect(result.sheets.find((sheet) => sheet.name === '美西FCL周价')?.rowCount).toBeGreaterThanOrEqual(11);
    expect(
      result.sheets.find((sheet) => sheet.name === '美西FCL周价')?.headerCandidates[0]
        ?.suggestions.length,
    ).toBeGreaterThanOrEqual(8);
  });

  it('auto-detects Case 01 standard English FCL headers on row 1', async () => {
    const file = resolve(__dirname, '../../../../../docs/07-sample-data/01_standard_english_FCL.xlsx');
    const result = await analyzeRateImportWorkbook('01_standard_english_FCL.xlsx', await readFile(file));
    const sheet = result.sheets[0];
    const candidate = sheet?.headerCandidates[0];

    expect(sheet?.name).toBe('FCL Rates');
    expect(candidate).toMatchObject({ row: 1, depth: 1 });
    expect(candidate?.suggestions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ targetField: 'polCode' }),
        expect.objectContaining({ targetField: 'podCode' }),
        expect.objectContaining({ targetField: 'carrierCode' }),
        expect.objectContaining({ targetField: 'serviceName' }),
        expect.objectContaining({ targetField: 'vesselVoyage' }),
        expect.objectContaining({ targetField: 'etd' }),
        expect.objectContaining({ targetField: 'transitDays' }),
        expect.objectContaining({ targetField: 'effectiveDate' }),
        expect.objectContaining({ targetField: 'expiryDate' }),
        expect.objectContaining({ targetField: 'currency' }),
        expect.objectContaining({ targetField: 'price20GpSell' }),
        expect.objectContaining({ targetField: 'price40GpSell' }),
        expect.objectContaining({ targetField: 'price40HqSell' }),
        expect.objectContaining({ targetField: 'freeTime' }),
        expect.objectContaining({ targetField: 'commodityRestriction' }),
        expect.objectContaining({ targetField: 'remark' }),
      ]),
    );
    expect(sheet?.sampleRows).toHaveLength(5);
  });

  it('auto-detects Case 02 Chinese FCL headers with global metadata on row 4', async () => {
    const file = resolve(__dirname, '../../../../../docs/07-sample-data/02_chinese_headers_global_validity.xlsx');
    const result = await analyzeRateImportWorkbook('02_chinese_headers_global_validity.xlsx', await readFile(file));
    const sheet = result.sheets[0];
    const candidate = sheet?.headerCandidates[0];

    expect(sheet?.name).toBe('东南亚FCL特价');
    expect(sheet?.rowCount).toBeGreaterThanOrEqual(9);
    expect(candidate).toMatchObject({ row: 4, depth: 1 });
    expect(candidate?.suggestions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ targetField: 'polName' }),
        expect.objectContaining({ targetField: 'podName' }),
        expect.objectContaining({ targetField: 'carrierCode' }),
        expect.objectContaining({ targetField: 'serviceName' }),
        expect.objectContaining({ targetField: 'transitDays' }),
        expect.objectContaining({ targetField: 'sailingPattern' }),
        expect.objectContaining({ targetField: 'price20GpSell' }),
        expect.objectContaining({ targetField: 'price40GpSell' }),
        expect.objectContaining({ targetField: 'price40HqSell' }),
        expect.objectContaining({ targetField: 'price45HqSell' }),
        expect.objectContaining({ targetField: 'freeTime' }),
        expect.objectContaining({ targetField: 'surcharge' }),
        expect.objectContaining({ targetField: 'commodityRestriction' }),
        expect.objectContaining({ targetField: 'remark' }),
      ]),
    );
    expect(sheet?.sampleRows).toHaveLength(5);
  });
});
