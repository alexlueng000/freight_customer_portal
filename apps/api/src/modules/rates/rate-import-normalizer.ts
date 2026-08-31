import { BadRequestException } from '@nestjs/common';
import type { RateImportColumnMappingDto } from './dto/create-rate-import-mapping-profile.dto.js';
import {
  loadRateImportWorkbook,
  rateImportCellText,
  type RateImportTargetField,
} from './rate-import-workbook-analyzer.js';

export interface RateImportPreviewConfig {
  sheetName: string;
  headerRow: number;
  headerDepth: 1 | 2;
  mappings: RateImportColumnMappingDto[];
}

export interface RateImportIssue {
  severity: 'ERROR' | 'WARNING';
  code: string;
  message: string;
  source: { sheet: string; row: number; column?: number; field?: RateImportTargetField };
}

export interface NormalizedRateImportPrice {
  containerType: string;
  costAmount?: string;
  sellAmount?: string;
  currency: string;
  sourceColumns: number[];
}

export interface NormalizedRateImport {
  source: { sheet: string; row: number };
  sourceRows: number[];
  rateNo?: string;
  polCode?: string;
  polName?: string;
  podCode?: string;
  podName?: string;
  carrierCode?: string;
  serviceName?: string;
  effectiveDate?: string;
  expiryDate?: string;
  etd?: string;
  transitDays?: number;
  supplierName?: string;
  contractNo?: string;
  currency?: string;
  status: string;
  remark?: string;
  prices: NormalizedRateImportPrice[];
}

const widePrices = [
  { containerType: '20GP', cost: 'price20GpCost', sell: 'price20GpSell' },
  { containerType: '40GP', cost: 'price40GpCost', sell: 'price40GpSell' },
  { containerType: '40HQ', cost: 'price40HqCost', sell: 'price40HqSell' },
] as const;

export async function previewRateImportWorkbook(buffer: Buffer, config: RateImportPreviewConfig) {
  validateConfig(config);
  const workbook = await loadRateImportWorkbook(buffer);
  const sheet = workbook.getWorksheet(config.sheetName);
  if (!sheet) {
    throw new BadRequestException({ code: 'RATE_IMPORT_SHEET_NOT_FOUND', message: '所选 Sheet 不存在。' });
  }
  const issues: RateImportIssue[] = [];
  const rates: NormalizedRateImport[] = [];
  const startRow = config.headerRow + 1;
  const columnByField = new Map(config.mappings.map((mapping) => [mapping.targetField, mapping.sourceColumn]));
  for (let rowNumber = startRow; rowNumber <= sheet.actualRowCount && rowNumber < startRow + 5000; rowNumber += 1) {
    const values = Object.fromEntries(config.mappings.map((mapping) => [
      mapping.targetField,
      rateImportCellText(sheet.getRow(rowNumber).getCell(mapping.sourceColumn).value),
    ])) as Partial<Record<RateImportTargetField, string>>;
    if (!Object.values(values).some(Boolean)) continue;
    const source = { sheet: sheet.name, row: rowNumber };
    const currency = upper(values.currency ?? values.priceCurrency ?? '');
    const status = upper(values.status ?? '') || 'DRAFT';
    const rate: NormalizedRateImport = {
      source,
      sourceRows: [rowNumber],
      rateNo: optionalUpper(values.rateNo), polCode: optionalUpper(values.polCode), polName: optional(values.polName),
      podCode: optionalUpper(values.podCode), podName: optional(values.podName), carrierCode: optionalUpper(values.carrierCode),
      serviceName: optional(values.serviceName), effectiveDate: dateOnly(values.effectiveDate), expiryDate: dateOnly(values.expiryDate),
      etd: dateTime(values.etd), transitDays: integer(values.transitDays), supplierName: optional(values.supplierName),
      contractNo: optional(values.contractNo), currency: currency || undefined, status, remark: optional(values.remark), prices: [],
    };
    for (const field of ['polCode', 'polName', 'podCode', 'podName', 'carrierCode', 'effectiveDate', 'expiryDate', 'currency'] as const) {
      if (!values[field]) addIssue(issues, 'ERROR', 'RATE_IMPORT_REQUIRED', `${field} 为必填字段。`, source, columnByField.get(field), field);
    }
    validateDate(issues, source, columnByField, values, 'effectiveDate', rate.effectiveDate);
    validateDate(issues, source, columnByField, values, 'expiryDate', rate.expiryDate);
    if (rate.effectiveDate && rate.expiryDate && rate.effectiveDate > rate.expiryDate) addIssue(issues, 'ERROR', 'RATE_IMPORT_DATE_RANGE_INVALID', '失效日期不能早于生效日期。', source, columnByField.get('expiryDate'), 'expiryDate');
    if (values.etd && !rate.etd) addIssue(issues, 'ERROR', 'RATE_IMPORT_DATETIME_INVALID', 'ETD 日期格式无法识别。', source, columnByField.get('etd'), 'etd');
    if (values.transitDays && rate.transitDays === undefined) addIssue(issues, 'ERROR', 'RATE_IMPORT_TRANSIT_DAYS_INVALID', '航程天数必须是 0–365 的整数。', source, columnByField.get('transitDays'), 'transitDays');
    if (currency && !/^[A-Z]{3}$/.test(currency)) addIssue(issues, 'ERROR', 'RATE_IMPORT_CURRENCY_INVALID', '币种必须为三位大写代码。', source, columnByField.get('currency'), 'currency');
    if (!['DRAFT', 'ACTIVE', 'EXPIRED', 'INACTIVE'].includes(status)) addIssue(issues, 'ERROR', 'RATE_IMPORT_STATUS_INVALID', '状态必须为 DRAFT、ACTIVE、EXPIRED 或 INACTIVE。', source, columnByField.get('status'), 'status');
    if (!values.status) addIssue(issues, 'WARNING', 'RATE_IMPORT_STATUS_DEFAULTED', '状态为空，预览中已默认设为 DRAFT。', source, undefined, 'status');
    if (!values.rateNo) addIssue(issues, 'WARNING', 'RATE_IMPORT_RATE_NO_MISSING', '运价编号为空，正式导入时需生成租户内唯一编号。', source, columnByField.get('rateNo'), 'rateNo');
    buildPrices(rate, values, columnByField, issues);
    if (!rate.prices.length) addIssue(issues, 'ERROR', 'RATE_IMPORT_PRICE_REQUIRED', '至少需要一个有效箱型价格。', source);
    rates.push(rate);
  }
  if (sheet.actualRowCount - config.headerRow > 5000) addIssue(issues, 'ERROR', 'RATE_IMPORT_ROW_LIMIT', '单次预览最多支持 5,000 个数据行。', { sheet: sheet.name, row: config.headerRow });
  const consolidatedRates = consolidateRates(rates, issues);
  return {
    summary: { rateCount: consolidatedRates.length, priceCount: consolidatedRates.reduce((sum, rate) => sum + rate.prices.length, 0), chargeCount: 0, errorCount: issues.filter((issue) => issue.severity === 'ERROR').length, warningCount: issues.filter((issue) => issue.severity === 'WARNING').length },
    rates: consolidatedRates.slice(0, 100), issues,
    truncated: consolidatedRates.length > 100,
  };
}

function consolidateRates(rates: NormalizedRateImport[], issues: RateImportIssue[]) {
  const consolidated = new Map<string, NormalizedRateImport>();
  rates.forEach((rate, index) => {
    const key = rate.rateNo ? `rate:${rate.rateNo}` : `row:${index}`;
    const existing = consolidated.get(key);
    if (!existing) { consolidated.set(key, rate); return; }
    const comparableFields = ['polCode', 'polName', 'podCode', 'podName', 'carrierCode', 'effectiveDate', 'expiryDate', 'currency', 'status'] as const;
    const mismatch = comparableFields.find((field) => (existing[field] ?? '') !== (rate[field] ?? ''));
    if (mismatch) addIssue(issues, 'ERROR', 'RATE_IMPORT_GROUP_MISMATCH', `相同运价编号的 ${mismatch} 必须保持一致。`, rate.source, undefined, mismatch);
    const seenTypes = new Set(existing.prices.map((price) => price.containerType));
    for (const price of rate.prices) {
      if (seenTypes.has(price.containerType)) addIssue(issues, 'ERROR', 'RATE_IMPORT_CONTAINER_DUPLICATE', `运价 ${rate.rateNo} 重复包含箱型 ${price.containerType}。`, rate.source, price.sourceColumns[0]);
      else { existing.prices.push(price); seenTypes.add(price.containerType); }
    }
    existing.sourceRows.push(...rate.sourceRows);
  });
  return [...consolidated.values()];
}

function buildPrices(rate: NormalizedRateImport, values: Partial<Record<RateImportTargetField, string>>, columns: Map<RateImportTargetField, number>, issues: RateImportIssue[]) {
  const currency = rate.currency ?? '';
  if (values.containerType || values.costAmount || values.sellAmount) {
    addPrice(rate, upper(values.containerType ?? ''), values.costAmount, values.sellAmount, currency, columns.get('costAmount'), columns.get('sellAmount'), columns.get('containerType'), issues);
  }
  for (const definition of widePrices) {
    if (values[definition.cost] || values[definition.sell]) addPrice(rate, definition.containerType, values[definition.cost], values[definition.sell], currency, columns.get(definition.cost), columns.get(definition.sell), undefined, issues);
  }
}

function addPrice(rate: NormalizedRateImport, containerType: string, cost: string | undefined, sell: string | undefined, currency: string, costColumn: number | undefined, sellColumn: number | undefined, containerColumn: number | undefined, issues: RateImportIssue[]) {
  const sourceColumns = [containerColumn, costColumn, sellColumn].filter((column): column is number => column !== undefined);
  if (!containerType) { addIssue(issues, 'ERROR', 'RATE_IMPORT_CONTAINER_TYPE_REQUIRED', '填写价格时必须指定箱型。', rate.source, containerColumn); return; }
  if (!cost) { addIssue(issues, 'ERROR', 'RATE_IMPORT_COST_REQUIRED', `箱型 ${containerType} 缺少采购成本。`, rate.source, costColumn); return; }
  const invalid = [[cost, costColumn], [sell, sellColumn]].some(([value, column]) => {
    if (typeof value === 'string' && value && !decimal(value)) { addIssue(issues, 'ERROR', 'RATE_IMPORT_AMOUNT_INVALID', `箱型 ${containerType} 金额必须是非负数且最多 4 位小数。`, rate.source, typeof column === 'number' ? column : undefined); return true; }
    return false;
  });
  if (!invalid) rate.prices.push({ containerType, costAmount: optional(cost), sellAmount: optional(sell), currency, sourceColumns });
}

function validateConfig(config: RateImportPreviewConfig) {
  if (!config.sheetName || !Number.isInteger(config.headerRow) || config.headerRow < 1 || ![1, 2].includes(config.headerDepth) || !Array.isArray(config.mappings) || !config.mappings.length) throw new BadRequestException({ code: 'RATE_IMPORT_PREVIEW_CONFIG_INVALID', message: '预览配置不完整。' });
  const sources = config.mappings.map((mapping) => mapping.sourceColumn); const targets = config.mappings.map((mapping) => mapping.targetField);
  if (new Set(sources).size !== sources.length || new Set(targets).size !== targets.length) throw new BadRequestException({ code: 'RATE_IMPORT_PREVIEW_MAPPING_DUPLICATE', message: '预览 Mapping 包含重复源列或目标字段。' });
}
function validateDate(issues: RateImportIssue[], source: { sheet: string; row: number }, columns: Map<RateImportTargetField, number>, values: Partial<Record<RateImportTargetField, string>>, field: 'effectiveDate' | 'expiryDate', parsed?: string) { if (values[field] && !parsed) addIssue(issues, 'ERROR', 'RATE_IMPORT_DATE_INVALID', '日期必须是有效的 yyyy-mm-dd 或 Excel 日期。', source, columns.get(field), field); }
function addIssue(issues: RateImportIssue[], severity: RateImportIssue['severity'], code: string, message: string, source: { sheet: string; row: number }, column?: number, field?: RateImportTargetField) { issues.push({ severity, code, message, source: { ...source, column, field } }); }
function optional(value?: string) { return value?.trim() || undefined; }
function upper(value: string) { return value.trim().toUpperCase(); }
function optionalUpper(value?: string) { const result = upper(value ?? ''); return result || undefined; }
function decimal(value: string) { return /^\d{1,14}(?:\.\d{1,4})?$/.test(value.trim().replace(/,/g, '')); }
function dateOnly(value?: string) { if (!value) return undefined; const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value); if (!match) return undefined; const date = new Date(`${match[1]}-${match[2]}-${match[3]}T00:00:00.000Z`); return Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== `${match[1]}-${match[2]}-${match[3]}` ? undefined : date.toISOString().slice(0, 10); }
function dateTime(value?: string) { if (!value) return undefined; const date = new Date(value); return Number.isNaN(date.getTime()) ? undefined : date.toISOString(); }
function integer(value?: string) { if (!value) return undefined; const number = Number(value); return Number.isInteger(number) && number >= 0 && number <= 365 ? number : undefined; }
