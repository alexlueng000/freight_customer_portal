import { BadRequestException } from '@nestjs/common';
import ExcelJS from 'exceljs';
import JSZip from 'jszip';

export const RATE_IMPORT_TARGET_FIELDS = [
  'rateNo',
  'polCode',
  'polName',
  'podCode',
  'podName',
  'carrierCode',
  'serviceName',
  'effectiveDate',
  'expiryDate',
  'etd',
  'transitDays',
  'supplierName',
  'contractNo',
  'currency',
  'status',
  'containerType',
  'costAmount',
  'sellAmount',
  'priceCurrency',
  'remark',
  'price20GpCost',
  'price20GpSell',
  'price40GpCost',
  'price40GpSell',
  'price40HqCost',
  'price40HqSell',
] as const;

export type RateImportTargetField = (typeof RATE_IMPORT_TARGET_FIELDS)[number];

export interface RateImportHeaderCandidate {
  row: number;
  depth: 1 | 2;
  score: number;
  labels: string[];
  suggestions: Array<{
    column: number;
    sourceLabel: string;
    targetField: RateImportTargetField;
    confidence: 'HIGH' | 'MEDIUM';
  }>;
}

const aliases: Record<RateImportTargetField, string[]> = {
  rateNo: ['运价编号', '费率编号', '报价编号', 'rate no', 'rateno'],
  polCode: ['起运港代码', 'pol code', 'polcode'],
  polName: ['起运港', '装货港', '始发港', 'pol', 'origin'],
  podCode: ['目的港代码', 'pod code', 'podcode'],
  podName: ['目的港', '卸货港', 'pod', 'destination'],
  carrierCode: ['船司代码', '船公司', '船东', 'carrier', 'shipping line'],
  serviceName: ['航线服务', '航线', 'service', 'route'],
  effectiveDate: ['生效日期', '开始日期', '有效期起', 'valid from', 'effective date'],
  expiryDate: ['失效日期', '截止日期', '有效期止', 'valid to', 'expiry date'],
  etd: ['预计开船时间', '开船日', '船期', 'etd'],
  transitDays: ['航程天数', '航程', 'transit days', 'transit time'],
  supplierName: ['供应商名称', '供应商', '代理', 'supplier', 'vendor'],
  contractNo: ['合约号', '约号', 'contract no', 'contract'],
  currency: ['运价币种', '基础币种', 'currency', 'curr'],
  status: ['状态', 'status'],
  containerType: ['箱型', '柜型', 'container type', 'equipment'],
  costAmount: ['采购成本', '成本价', 'buy rate', 'cost'],
  sellAmount: ['标准售价', '销售价', 'sell rate', 'selling price'],
  priceCurrency: ['价格币种', 'price currency'],
  remark: ['备注', '条款', '说明', 'remark', 'remarks', 'note'],
  price20GpCost: ['20gp采购成本', '20gp成本', '20dc成本', '20gp buy', '20 cost'],
  price20GpSell: ['20gp标准售价', '20gp售价', '20dc售价', '20gp sell', '20 sell'],
  price40GpCost: ['40gp采购成本', '40gp成本', '40dc成本', '40gp buy', '40 cost'],
  price40GpSell: ['40gp标准售价', '40gp售价', '40dc售价', '40gp sell', '40 sell'],
  price40HqCost: ['40hq采购成本', '40hq成本', '40hc成本', '40hq buy', '40hc buy'],
  price40HqSell: ['40hq标准售价', '40hq售价', '40hc售价', '40hq sell', '40hc sell'],
};

export async function analyzeRateImportWorkbook(fileName: string, buffer: Buffer) {
  const workbook = await loadRateImportWorkbook(buffer);
  if (!workbook.worksheets.length) {
    throw new BadRequestException({
      code: 'RATE_IMPORT_WORKBOOK_EMPTY',
      message: '工作簿中没有可读取的 Sheet。',
    });
  }

  return {
    fileName,
    sheets: workbook.worksheets.map((sheet, index) => analyzeSheet(sheet, index)),
  };
}

export async function loadRateImportWorkbook(buffer: Buffer) {
  const workbook = new ExcelJS.Workbook();
  try {
    await workbook.xlsx.load(buffer as unknown as ExcelJS.Buffer);
  } catch (primaryError) {
    try {
      const compatibleBuffer = await normalizeOpenXmlPrefixes(buffer);
      await workbook.xlsx.load(compatibleBuffer as unknown as ExcelJS.Buffer);
    } catch {
      throw new BadRequestException({
        code: 'RATE_IMPORT_WORKBOOK_INVALID',
        message: '无法读取该 Excel 工作簿，请确认文件未损坏且格式为 .xlsx。',
        details: { parser: primaryError instanceof Error ? primaryError.name : 'unknown' },
      });
    }
  }

  return workbook;
}

async function normalizeOpenXmlPrefixes(buffer: Buffer) {
  const archive = await JSZip.loadAsync(buffer);
  const xmlEntries = Object.values(archive.files).filter(
    (entry) => !entry.dir && entry.name.endsWith('.xml'),
  );
  await Promise.all(
    xmlEntries.map(async (entry) => {
      const xml = await entry.async('string');
      if (!xml.includes('<x:') && !xml.includes('</x:')) return;
      archive.file(
        entry.name,
        xml
          .replace(/(<\/?)(x):/g, '$1')
          .replace(/xmlns:x=/g, 'xmlns='),
      );
    }),
  );
  return archive.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
}

function analyzeSheet(sheet: ExcelJS.Worksheet, index: number) {
  const columnCount = Math.min(Math.max(sheet.actualColumnCount, 1), 100);
  const scanRows = Math.min(sheet.actualRowCount, 20);
  const candidates: RateImportHeaderCandidate[] = [];

  for (let row = 1; row <= scanRows; row += 1) {
    candidates.push(buildCandidate(sheet, row, 1, columnCount));
    if (row > 1) candidates.push(buildCandidate(sheet, row, 2, columnCount));
  }

  const headerCandidates = candidates
    .filter((candidate) => candidate.score > 0)
    .sort((a, b) => b.score - a.score || a.row - b.row || a.depth - b.depth)
    .slice(0, 5);
  const selected = headerCandidates[0];
  const sampleStart = selected ? selected.row + 1 : 1;

  return {
    index,
    name: sheet.name,
    rowCount: sheet.actualRowCount,
    columnCount: sheet.actualColumnCount,
    mergedCellRanges: Object.keys((sheet as unknown as { _merges?: Record<string, unknown> })._merges ?? {}).length,
    headerCandidates,
    sampleRows: readRows(sheet, sampleStart, columnCount, 5),
  };
}

function buildCandidate(
  sheet: ExcelJS.Worksheet,
  row: number,
  depth: 1 | 2,
  columnCount: number,
): RateImportHeaderCandidate {
  const labels = Array.from({ length: columnCount }, (_, index) => {
    const current = rateImportCellText(sheet.getRow(row).getCell(index + 1).value);
    if (depth === 1 || row === 1) return current;
    const parent = rateImportCellText(sheet.getRow(row - 1).getCell(index + 1).value);
    return parent && current && normalize(parent) !== normalize(current)
      ? `${parent} ${current}`
      : current || parent;
  });
  const used = new Set<RateImportTargetField>();
  const suggestions = labels.flatMap((sourceLabel, index) => {
    const suggestion = suggestField(sourceLabel, used);
    if (!suggestion) return [];
    used.add(suggestion.targetField);
    return [{ column: index + 1, sourceLabel, ...suggestion }];
  });
  return {
    row,
    depth,
    score: suggestions.reduce(
      (sum, suggestion) => sum + (suggestion.confidence === 'HIGH' ? 2 : 1),
      0,
    ),
    labels,
    suggestions,
  };
}

function suggestField(sourceLabel: string, used: Set<RateImportTargetField>) {
  const value = normalize(sourceLabel);
  if (!value) return undefined;
  const matches = RATE_IMPORT_TARGET_FIELDS.flatMap((targetField) => {
    if (used.has(targetField)) return [];
    const match = aliases[targetField]
      .map(normalize)
      .map((alias) => ({ alias, exact: alias === value }))
      .filter(({ alias }) => alias === value || (alias.length >= 3 && value.includes(alias)))
      .sort((a, b) => Number(b.exact) - Number(a.exact) || b.alias.length - a.alias.length)[0];
    return match ? [{ targetField, ...match }] : [];
  }).sort((a, b) => Number(b.exact) - Number(a.exact) || b.alias.length - a.alias.length);
  const best = matches[0];
  return best
    ? {
        targetField: best.targetField,
        confidence: best.exact ? ('HIGH' as const) : ('MEDIUM' as const),
      }
    : undefined;
}

function readRows(sheet: ExcelJS.Worksheet, start: number, columnCount: number, limit: number) {
  const rows: Array<{ row: number; values: string[] }> = [];
  for (let row = start; row <= sheet.actualRowCount && rows.length < limit; row += 1) {
    const values = Array.from({ length: columnCount }, (_, index) =>
      rateImportCellText(sheet.getRow(row).getCell(index + 1).value),
    );
    if (values.some(Boolean)) rows.push({ row, values });
  }
  return rows;
}

function normalize(value: string) {
  return value.toLowerCase().replace(/[\s_\-/'"（）()]+/g, '');
}

export function rateImportCellText(value: ExcelJS.CellValue): string {
  if (value === null || value === undefined) return '';
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'object') {
    if ('text' in value) return String(value.text).trim();
    if ('result' in value) return rateImportCellText(value.result);
    if ('richText' in value) return value.richText.map((part) => part.text).join('').trim();
    return '';
  }
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return '';
}
