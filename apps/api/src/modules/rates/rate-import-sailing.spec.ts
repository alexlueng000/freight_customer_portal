import ExcelJS from 'exceljs';
import { analyzeRateImportWorkbook } from './rate-import-workbook-analyzer.js';
import { previewRateImportWorkbook } from './rate-import-normalizer.js';

async function preview(sailing: string | Date, status = '草稿', effective = '') {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Rates');
  sheet.addRow(['有效期：2026/09/01-2026/09/30', '币种：USD']);
  sheet.addRow(['起运港', '目的港', '船公司', '20尺普柜', '开船日', '有效开始日期', '有效结束日期', '状态（必填）']);
  sheet.addRow(['上海', '洛杉矶', 'PIL', 500, sailing, effective, '', status]);
  const buffer = Buffer.from(await workbook.xlsx.writeBuffer());
  const analysis = await analyzeRateImportWorkbook('sailing.xlsx', buffer);
  const header = analysis.sheets[0]!.headerCandidates[0]!;
  expect(header.row).toBe(2);
  expect(header.suggestions).toEqual(expect.arrayContaining([
    expect.objectContaining({ column: 6, targetField: 'effectiveDate' }),
    expect.objectContaining({ column: 7, targetField: 'expiryDate' }),
    expect.objectContaining({ column: 8, targetField: 'status' }),
  ]));
  return previewRateImportWorkbook(buffer, {
    sheetName: sheet.name, headerRow: header.row, headerDepth: header.depth,
    mappings: header.suggestions.map((item) => ({ sourceColumn: item.column, sourceLabel: item.sourceLabel, targetField: item.targetField })),
  });
}

describe('mixed sailing dates and Chinese rate fields', () => {
  it.each(['2026年9月15日', '2026-09-15', '2026/9/15', '2026.9.15', new Date('2026-09-15T00:00:00.000Z')])('recognizes exact date %s', async (input) => {
    const result = await preview(input);
    expect(result.summary.errorCount).toBe(0);
    expect(result.summary.warningCount).toBe(0);
    expect(result.rates[0]?.etd).toBe('2026-09-15T00:00:00.000Z');
    expect(result.rates[0]?.sailingPattern).toBeUndefined();
  });
  it.each(['每周五', '每月15日', '每月31日', 'FRI'])('preserves recurrence %s without guessing an ETD', async (input) => {
    const result = await preview(input);
    expect(result.summary.warningCount).toBe(0);
    expect(result.rates[0]?.etd).toBeUndefined();
    expect(result.rates[0]?.sailingPattern).toBe(input);
    expect(result.rates[0]?.remark).toContain(`Schedule: ${input}`);
  });
  it.each(['2026年2月30日', '2026-02-30', '每月32日', '待定'])('warns and retains unrecognized input %s', async (input) => {
    const result = await preview(input);
    expect(result.rates[0]?.etd).toBeUndefined();
    expect(result.issues).toEqual(expect.arrayContaining([expect.objectContaining({ code: 'RATE_IMPORT_ETD_NOT_EXACT_DATE' })]));
    expect(result.rates[0]?.remark).toContain(input);
  });
  it.each([['草稿', 'DRAFT'], ['启用', 'ACTIVE'], ['已过期', 'EXPIRED'], ['停用', 'INACTIVE'], ['active', 'ACTIVE']])('maps status %s', async (input, expected) => {
    expect((await preview('每周五', input)).rates[0]?.status).toBe(expected);
  });
  it.each(['', '待审核'])('rejects missing or unknown mapped status %s', async (input) => {
    const issue = (await preview('每周五', input)).issues.find((item) => item.code === 'RATE_IMPORT_STATUS_INVALID');
    expect(issue).toMatchObject({ severity: 'ERROR', source: { row: 3, column: 8 } });
  });
  it('does not hide an invalid explicit validity date behind global defaults', async () => {
    const result = await preview('每周五', '草稿', '2026年2月30日');
    expect(result.rates[0]?.effectiveDate).toBeUndefined();
    expect(result.issues).toEqual(expect.arrayContaining([expect.objectContaining({ code: 'RATE_IMPORT_DATE_INVALID' })]));
  });
});
