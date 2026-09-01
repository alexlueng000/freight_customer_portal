import { BadRequestException } from '@nestjs/common';
import type ExcelJS from 'exceljs';
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
  defaults?: {
    effectiveDate?: string;
    expiryDate?: string;
    currency?: string;
  };
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

export interface NormalizedRateImportCharge {
  chargeCode: string;
  chargeName: string;
  chargeBasis: 'PER_CONTAINER' | 'PER_BL' | 'PER_SHIPMENT';
  containerType?: string;
  amount: string;
  currency: string;
  isIncluded: boolean;
  sourceColumn: number;
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
  charges: NormalizedRateImportCharge[];
}

interface RateImportGlobalDefaults {
  effectiveDate?: string;
  expiryDate?: string;
  currency?: string;
  quotationDate?: string;
  year?: number;
}

const widePrices = [
  { containerType: '20GP', cost: 'price20GpCost', sell: 'price20GpSell' },
  { containerType: '40GP', cost: 'price40GpCost', sell: 'price40GpSell' },
  { containerType: '40HQ', cost: 'price40HqCost', sell: 'price40HqSell' },
  { containerType: '45HQ', cost: 'price45HqCost', sell: 'price45HqSell' },
] as const;

const portAliases = [
  { code: 'CNSHA', name: 'Shanghai', aliases: ['CNSHA', 'SHA', 'SHANGHAI', '上海', '沪'] },
  { code: 'CNNGB', name: 'Ningbo', aliases: ['CNNGB', 'NGB', 'NINGBO', '宁波'] },
  { code: 'CNSZX', name: 'Shenzhen', aliases: ['CNSZX', 'SZX', 'SHENZHEN', '深圳', 'YTN', 'YANTIAN', '盐田', 'SHEKOU', '蛇口'] },
  { code: 'CNXMN', name: 'Xiamen', aliases: ['CNXMN', 'XMN', 'XIAMEN', '厦门'] },
  { code: 'CNTAO', name: 'Qingdao', aliases: ['CNTAO', 'TAO', 'QINGDAO', '青岛'] },
  { code: 'SGSIN', name: 'Singapore', aliases: ['SGSIN', 'SIN', 'SINGAPORE', '新加坡'] },
  { code: 'MYPKG', name: 'Port Klang', aliases: ['MYPKG', 'PKG', 'PORT KLANG', 'PORTKLANG', '巴生港'] },
  { code: 'THBKK', name: 'Bangkok', aliases: ['THBKK', 'BKK', 'BANGKOK', '曼谷'] },
  { code: 'VNSGN', name: 'Ho Chi Minh City', aliases: ['VNSGN', 'SGN', 'HO CHI MINH', 'HOCHIMINH', '胡志明'] },
  { code: 'IDJKT', name: 'Jakarta', aliases: ['IDJKT', 'JKT', 'JAKARTA', '雅加达'] },
  { code: 'USLAX', name: 'Los Angeles', aliases: ['USLAX', 'LAX', 'LOS ANGELES', 'LOS ANGELES CA', 'LA', '洛杉矶'] },
  { code: 'USLGB', name: 'Long Beach', aliases: ['USLGB', 'LGB', 'LONG BEACH', 'LONG BEACH CA'] },
  { code: 'USNYC', name: 'New York', aliases: ['USNYC', 'NYC', 'NEW YORK', 'NEW YORK NY'] },
  { code: 'USSAV', name: 'Savannah', aliases: ['USSAV', 'SAV', 'SAVANNAH', 'SAVANNAH GA'] },
  { code: 'USOAK', name: 'Oakland', aliases: ['USOAK', 'OAK', 'OAKLAND'] },
  { code: 'USTIW', name: 'Tacoma', aliases: ['USTIW', 'TACOMA'] },
  { code: 'USSEA', name: 'Seattle', aliases: ['USSEA', 'SEA', 'SEATTLE'] },
  { code: 'KRPUS', name: 'Busan', aliases: ['KRPUS', 'PUS', 'BUSAN', 'PUSAN', '釜山'] },
  { code: 'DEHAM', name: 'Hamburg', aliases: ['DEHAM', 'HAM', 'HAMBURG', '汉堡'] },
];

const carrierAliases = [
  { code: 'COSCO', aliases: ['COSCO', '中远', '中远海运'] },
  { code: 'MAEU', aliases: ['MAEU', 'MSK', 'MAERSK', 'MAERSK LINE', '马士基'] },
  { code: 'MSCU', aliases: ['MSCU', 'MSC', '地中海'] },
  { code: 'ONEY', aliases: ['ONEY', 'ONE'] },
  { code: 'OOCL', aliases: ['OOCL', 'OOLU', '东方海外'] },
  { code: 'EGLV', aliases: ['EGLV', 'EMC', 'EVERGREEN', 'EVERGREEN MARINE', '长荣'] },
  { code: 'PIL', aliases: ['PIL', '太平船务'] },
  { code: 'SITC', aliases: ['SITC', '海丰'] },
  { code: 'RCL', aliases: ['RCL'] },
  { code: 'CNC', aliases: ['CNC'] },
];

const surchargeColumns: Array<{ field: RateImportTargetField; code: string; name: string }> = [
  { field: 'surchargeBaf', code: 'BAF', name: 'BAF' },
  { field: 'surchargePss', code: 'PSS', name: 'PSS' },
  { field: 'surchargeDoc', code: 'DOC', name: 'Documentation Fee' },
  { field: 'surchargeSeal', code: 'SEAL', name: 'Seal Fee' },
];

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
  const globalDefaults = extractGlobalDefaults(sheet, config.headerRow);
  const columnByField = new Map(config.mappings.map((mapping) => [mapping.targetField, mapping.sourceColumn]));
  for (let rowNumber = startRow; rowNumber <= sheet.rowCount && rowNumber < startRow + 5000; rowNumber += 1) {
    const values = Object.fromEntries(config.mappings.map((mapping) => [
      mapping.targetField,
      rateImportCellText(sheet.getRow(rowNumber).getCell(mapping.sourceColumn).value),
    ])) as Partial<Record<RateImportTargetField, string>>;
    if (!Object.values(values).some(Boolean)) continue;
    const source = { sheet: sheet.name, row: rowNumber };
    const rowCurrency = normalizeCurrency(values.currency ?? values.priceCurrency);
    const defaultCurrency = normalizeCurrency(config.defaults?.currency);
    const currency = rowCurrency ?? globalDefaults.currency ?? defaultCurrency;
    const status = upper(values.status ?? '') || 'DRAFT';
    const dateContext = {
      year: globalDefaults.year,
      quotationDate: globalDefaults.quotationDate,
      effectiveDate: globalDefaults.effectiveDate,
      expiryDate: globalDefaults.expiryDate,
    };
    const rate: NormalizedRateImport = {
      source,
      sourceRows: [rowNumber],
      rateNo: optionalUpper(values.rateNo), polCode: optionalUpper(values.polCode), polName: optional(values.polName),
      podCode: optionalUpper(values.podCode), podName: optional(values.podName), carrierCode: optionalUpper(values.carrierCode),
      serviceName: optional(values.serviceName), effectiveDate: parseFreightDate(values.effectiveDate, dateContext) ?? globalDefaults.effectiveDate ?? parseFreightDate(config.defaults?.effectiveDate, dateContext), expiryDate: parseFreightDate(values.expiryDate, dateContext) ?? globalDefaults.expiryDate ?? parseFreightDate(config.defaults?.expiryDate, dateContext),
      etd: parseExactDateTime(values.etd), transitDays: normalizeTransitDays(values.transitDays), supplierName: optional(values.supplierName),
      contractNo: optional(values.contractNo), currency, status, remark: buildRemark(values), prices: [], charges: [],
    };
    applyBusinessAliases(rate);
    for (const field of ['polCode', 'polName', 'podCode', 'podName', 'carrierCode', 'effectiveDate', 'expiryDate', 'currency'] as const) {
      if (!rate[field]) addIssue(issues, 'ERROR', 'RATE_IMPORT_REQUIRED', `${businessFieldLabel(field)}缺失或未正确识别。`, source, columnByField.get(field), field);
    }
    validateDate(issues, source, columnByField, values, 'effectiveDate', rate.effectiveDate, config.defaults);
    validateDate(issues, source, columnByField, values, 'expiryDate', rate.expiryDate, config.defaults);
    if (rate.effectiveDate && rate.expiryDate && rate.effectiveDate > rate.expiryDate) addIssue(issues, 'ERROR', 'RATE_IMPORT_DATE_RANGE_INVALID', '失效日期不能早于生效日期。', source, columnByField.get('expiryDate'), 'expiryDate');
    if (values.etd && !rate.etd && !isSailingPattern(values.etd)) addIssue(issues, 'WARNING', 'RATE_IMPORT_ETD_NOT_EXACT_DATE', '开船日不是精确 ETD 日期，预览中不会写入 ETD。', source, columnByField.get('etd'), 'etd');
    if (values.transitDays && rate.transitDays === undefined) addIssue(issues, 'ERROR', 'RATE_IMPORT_TRANSIT_DAYS_INVALID', '航程天数必须是 0–365 的整数。', source, columnByField.get('transitDays'), 'transitDays');
    if ((values.currency || values.priceCurrency || config.defaults?.currency) && !currency) addIssue(issues, 'ERROR', 'RATE_IMPORT_CURRENCY_INVALID', '币种必须为三位大写代码。', source, columnByField.get(values.currency ? 'currency' : 'priceCurrency'), 'currency');
    if (!['DRAFT', 'ACTIVE', 'EXPIRED', 'INACTIVE'].includes(status)) addIssue(issues, 'ERROR', 'RATE_IMPORT_STATUS_INVALID', '状态必须为 DRAFT、ACTIVE、EXPIRED 或 INACTIVE。', source, columnByField.get('status'), 'status');
    buildPrices(rate, values, columnByField, issues);
    buildCharges(rate, values, columnByField, issues);
    if (!rate.prices.length) addIssue(issues, 'ERROR', 'RATE_IMPORT_PRICE_REQUIRED', '至少需要一个有效箱型价格。', source);
    rates.push(rate);
  }
  if (sheet.rowCount - config.headerRow > 5000) addIssue(issues, 'ERROR', 'RATE_IMPORT_ROW_LIMIT', '单次预览最多支持 5,000 个数据行。', { sheet: sheet.name, row: config.headerRow });
  const consolidatedRates = consolidateRates(rates, issues);
  const issueSummary = aggregateImportIssueCounts(issues);
  return {
    summary: { rateCount: consolidatedRates.length, priceCount: consolidatedRates.reduce((sum, rate) => sum + rate.prices.length, 0), chargeCount: consolidatedRates.reduce((sum, rate) => sum + rate.charges.length, 0), errorCount: issueSummary.errorCount, warningCount: issueSummary.warningCount },
    rates: consolidatedRates, issues,
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
    existing.charges.push(...rate.charges);
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

function buildCharges(rate: NormalizedRateImport, values: Partial<Record<RateImportTargetField, string>>, columns: Map<RateImportTargetField, number>, issues: RateImportIssue[]) {
  for (const definition of surchargeColumns) {
    const parsed = parseSurchargeAmount(values[definition.field], rate.currency);
    if (!parsed) continue;
    if (!rate.currency) {
      addIssue(issues, 'ERROR', 'RATE_IMPORT_CURRENCY_REQUIRED_FOR_CHARGE', `${definition.code} 附加费需要币种。`, rate.source, columns.get(definition.field), 'currency');
      continue;
    }
    rate.charges.push({
      chargeCode: definition.code,
      chargeName: definition.name,
      chargeBasis: parsed.basis,
      containerType: parsed.basis === 'PER_CONTAINER' ? 'ALL' : undefined,
      amount: parsed.amount,
      currency: parsed.currency,
      isIncluded: false,
      sourceColumn: columns.get(definition.field) ?? 0,
    });
  }
}

function applyBusinessAliases(rate: NormalizedRateImport) {
  const pol = findPort(rate.polCode) ?? findPort(rate.polName);
  if (pol) {
    rate.polCode = pol.code;
    rate.polName = isPortCode(rate.polName) ? pol.name : rate.polName || pol.name;
  }
  const pod = findPort(rate.podCode) ?? findPort(rate.podName);
  if (pod) {
    rate.podCode = pod.code;
    rate.podName = isPortCode(rate.podName) ? pod.name : rate.podName || pod.name;
  }
  const carrier = findCarrier(rate.carrierCode);
  if (carrier) rate.carrierCode = carrier.code;
}

function findPort(value?: string) {
  const normalized = normalizeAlias(value);
  if (!normalized) return undefined;
  const direct = /^[A-Z]{5}$/.test(normalized) ? portAliases.find((port) => port.code === normalized) : undefined;
  if (direct) return direct;
  return portAliases.find((port) => port.aliases.some((alias) => normalizeAlias(alias) === normalized))
    ?? portAliases.find((port) => port.aliases.some((alias) => {
      const normalizedAlias = normalizeAlias(alias);
      return normalizedAlias.length >= 3 && normalized.includes(normalizedAlias);
    }));
}

function findCarrier(value?: string) {
  const normalized = normalizeAlias(value);
  if (!normalized) return undefined;
  return carrierAliases.find((carrier) => carrier.aliases.some((alias) => normalizeAlias(alias) === normalized));
}

function normalizeAlias(value?: string) {
  return value?.trim().toUpperCase().normalize('NFKC').replace(/[’‘`]/g, "'").replace(/,?\s+(?:CHINA|KOREA|CA|NY|GA)$/i, '').replace(/[\s_\-/'"（）(),.=]+/g, '') ?? '';
}

function extractGlobalDefaults(sheet: ExcelJS.Worksheet, headerRow: number): RateImportGlobalDefaults {
  const metadataText = Array.from({ length: Math.max(0, headerRow - 1) }, (_, index) => index + 1)
    .flatMap((rowNumber) => {
      const row = sheet.getRow(rowNumber);
      return Array.from({ length: row.cellCount }, (_, cellIndex) =>
        rateImportCellText(row.getCell(cellIndex + 1).value),
      );
    })
    .filter(Boolean)
    .join(' ');
  return {
    ...parseGlobalValidity(metadataText),
    currency: parseGlobalCurrency(metadataText),
    quotationDate: parseGlobalQuotationDate(metadataText),
    year: parseGlobalYear(metadataText),
  };
}

function parseGlobalValidity(value: string): Pick<RateImportGlobalDefaults, 'effectiveDate' | 'expiryDate'> {
  const compact = value.replace(/\s+/g, ' ');
  const match =
    /(?:有效期|validity|valid\s*from)[：:\s]*([0-9]{4}[/.-][0-9]{1,2}[/.-][0-9]{1,2})\s*(?:-|至|to|~|–|—)\s*([0-9]{4}[/.-][0-9]{1,2}[/.-][0-9]{1,2})/i.exec(compact) ??
    /(?:有效期|validity)[：:\s]*([A-Z]{3}\s+\d{1,2})\s*(?:-|至|to|~|–|—)\s*(\d{1,2}),?\s*(\d{4})/i.exec(compact) ??
    /([0-9]{4}[/.-][0-9]{1,2}[/.-][0-9]{1,2})\s*(?:-|至|to|~|–|—)\s*([0-9]{4}[/.-][0-9]{1,2}[/.-][0-9]{1,2})/i.exec(compact);
  if (!match) return {};
  if (match[3]) {
    const year = Number(match[3]);
    return { effectiveDate: parseFreightDate(`${match[1]} ${year}`), expiryDate: parseFreightDate(`${match[1]!.replace(/\d{1,2}/, match[2]!)} ${year}`) };
  }
  const context = { year: parseGlobalYear(compact) };
  return { effectiveDate: parseFreightDate(match[1], context), expiryDate: parseFreightDate(match[2], context) };
}

function parseGlobalCurrency(value: string) {
  const labeled = /(?:币种|currency|cur)[：:\s]*([A-Z]{3}|US\$|\$|美金|美元|RMB|人民币|￥|¥|€|欧元)/i.exec(value);
  if (labeled) return normalizeCurrency(labeled[1]);
  const standalone = /(?:^|\s)(USD|CNY|EUR|HKD|JPY|US\$|\$|美金|美元|RMB|人民币|￥|¥|€|欧元)(?:\s|$)/i.exec(value);
  return standalone ? normalizeCurrency(standalone[1]) : undefined;
}

function parseGlobalQuotationDate(value: string) {
  const match = /(?:报价日期|quote\s*date)[：:\s]*([0-9]{4}[/.-][0-9]{1,2}[/.-][0-9]{1,2})/i.exec(value);
  return parseFreightDate(match?.[1]);
}

function parseGlobalYear(value: string) {
  const direct = /(?:报价日期|quote\s*date|有效期|validity)[^\d]*(20\d{2})/i.exec(value)?.[1] ?? /(20\d{2})/.exec(value)?.[1];
  return direct ? Number(direct) : undefined;
}

function addPrice(rate: NormalizedRateImport, containerType: string, cost: string | undefined, sell: string | undefined, currency: string, costColumn: number | undefined, sellColumn: number | undefined, containerColumn: number | undefined, issues: RateImportIssue[]) {
  const sourceColumns = [containerColumn, costColumn, sellColumn].filter((column): column is number => column !== undefined);
  const normalizedContainerType = normalizeContainerType(containerType);
  if (!normalizedContainerType) { addIssue(issues, 'ERROR', 'RATE_IMPORT_CONTAINER_TYPE_REQUIRED', '填写价格时必须指定箱型。', rate.source, containerColumn); return; }
  const normalizedCost = optional(cost) ?? optional(sell);
  const normalizedSell = optional(cost) ? optional(sell) : undefined;
  if (!normalizedCost) { addIssue(issues, 'ERROR', 'RATE_IMPORT_AMOUNT_REQUIRED', `箱型 ${normalizedContainerType} 缺少运价金额。`, rate.source, costColumn ?? sellColumn); return; }
  const invalid = [[normalizedCost, costColumn ?? sellColumn], [normalizedSell, sellColumn]].some(([value, column]) => {
    if (typeof value === 'string' && value && !decimal(value)) { addIssue(issues, 'ERROR', 'RATE_IMPORT_AMOUNT_INVALID', `箱型 ${normalizedContainerType} 金额必须是非负数且最多 4 位小数。`, rate.source, typeof column === 'number' ? column : undefined); return true; }
    return false;
  });
  if (!invalid) rate.prices.push({ containerType: normalizedContainerType, costAmount: normalizedCost?.replace(/,/g, ''), sellAmount: normalizedSell?.replace(/,/g, ''), currency, sourceColumns });
}

export function aggregateImportIssueCounts(issues: RateImportIssue[]) {
  const grouped = new Set(issues.map((issue) => `${issue.severity}:${issueGroupKey(issue)}`));
  return {
    errorCount: [...grouped].filter((key) => key.startsWith('ERROR:')).length,
    warningCount: [...grouped].filter((key) => key.startsWith('WARNING:')).length,
  };
}

function validateConfig(config: RateImportPreviewConfig) {
  if (!config.sheetName || !Number.isInteger(config.headerRow) || config.headerRow < 1 || ![1, 2].includes(config.headerDepth) || !Array.isArray(config.mappings) || !config.mappings.length) throw new BadRequestException({ code: 'RATE_IMPORT_PREVIEW_CONFIG_INVALID', message: '预览配置不完整。' });
  const sources = config.mappings.map((mapping) => mapping.sourceColumn); const targets = config.mappings.map((mapping) => mapping.targetField);
  if (new Set(sources).size !== sources.length || new Set(targets).size !== targets.length) throw new BadRequestException({ code: 'RATE_IMPORT_PREVIEW_MAPPING_DUPLICATE', message: '预览 Mapping 包含重复源列或目标字段。' });
}
function addIssue(issues: RateImportIssue[], severity: RateImportIssue['severity'], code: string, message: string, source: { sheet: string; row: number }, column?: number, field?: RateImportTargetField) { issues.push({ severity, code, message, source: { ...source, column, field } }); }
function businessFieldLabel(field: RateImportTargetField) { return ({ polCode: '起运港', polName: '起运港名称', podCode: '目的港', podName: '目的港名称', carrierCode: '船司', effectiveDate: '生效日期', expiryDate: '失效日期', currency: '币种' } as Partial<Record<RateImportTargetField, string>>)[field] ?? field; }
function isPortCode(value?: string) { return /^[A-Z]{5}$/.test(normalizeAlias(value)); }
function issueGroupKey(issue: RateImportIssue) {
  if (issue.code === 'RATE_IMPORT_REQUIRED' && ['effectiveDate', 'expiryDate', 'currency'].includes(issue.source.field ?? '')) return 'rateBasics';
  if (issue.source.field === 'effectiveDate' || issue.source.field === 'expiryDate') return 'validity';
  if (issue.source.field === 'polCode' || issue.source.field === 'polName') return 'pol';
  if (issue.source.field === 'podCode' || issue.source.field === 'podName') return 'pod';
  return issue.source.field ?? issue.code;
}
function optional(value?: string) { return value?.trim() || undefined; }
function upper(value: string) { return value.trim().toUpperCase(); }
function optionalUpper(value?: string) { const result = upper(value ?? ''); return result || undefined; }
function decimal(value: string) { return /^\d{1,14}(?:\.\d{1,4})?$/.test(value.trim().replace(/,/g, '')); }
function validateDate(issues: RateImportIssue[], source: { sheet: string; row: number }, columns: Map<RateImportTargetField, number>, values: Partial<Record<RateImportTargetField, string>>, field: 'effectiveDate' | 'expiryDate', parsed?: string, defaults?: RateImportPreviewConfig['defaults']) { if ((values[field] || defaults?.[field]) && !parsed) addIssue(issues, 'ERROR', 'RATE_IMPORT_DATE_INVALID', '日期必须是有效日期。', source, columns.get(field), field); }
function normalizeCurrency(value?: string) {
  const normalized = value?.trim().toUpperCase().normalize('NFKC');
  if (!normalized) return undefined;
  if (['USD', 'US$', '$', '美金', '美元'].includes(normalized)) return 'USD';
  if (['CNY', 'RMB', '人民币', '￥', '¥'].includes(normalized)) return 'CNY';
  if (['EUR', '€', '欧元'].includes(normalized)) return 'EUR';
  if (/^[A-Z]{3}$/.test(normalized)) return normalized;
  return undefined;
}
function normalizeTransitDays(value?: string) {
  if (!value) return undefined;
  const match = /^(\d+)\s*(?:天|days?)?$/i.exec(value.trim());
  const number = match ? Number(match[1]) : Number(value);
  return Number.isInteger(number) && number >= 0 && number <= 365 ? number : undefined;
}
function parseFreightDate(value?: string, context: Pick<RateImportGlobalDefaults, 'year' | 'quotationDate' | 'effectiveDate' | 'expiryDate'> = {}) {
  if (!value) return undefined;
  const trimmed = value.trim();
  const iso = /^(\d{4})[/.-](\d{1,2})[/.-](\d{1,2})/.exec(trimmed);
  if (iso) return validDate(Number(iso[1]), Number(iso[2]), Number(iso[3]));
  const dashMonth = /^(\d{1,2})[-\s]([A-Z]{3,})[-,\s]+(\d{4})$/i.exec(trimmed);
  if (dashMonth) return validDate(Number(dashMonth[3]), monthNumber(dashMonth[2]), Number(dashMonth[1]));
  const monthFirst = /^([A-Z]{3,})\s+(\d{1,2}),?\s+(\d{4})$/i.exec(trimmed);
  if (monthFirst) return validDate(Number(monthFirst[3]), monthNumber(monthFirst[1]), Number(monthFirst[2]));
  const cn = /^(\d{1,2})月(\d{1,2})日?$/.exec(trimmed);
  if (cn) return validDate(inferYear(context), Number(cn[1]), Number(cn[2]));
  const short = /^(\d{1,2})\/(\d{1,2})$/.exec(trimmed);
  if (short) return validDate(inferYear(context), Number(short[1]), Number(short[2]));
  const parsed = new Date(trimmed);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed.toISOString().slice(0, 10);
}
function parseExactDateTime(value?: string) {
  if (!value || isSailingPattern(value)) return undefined;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
}
function isSailingPattern(value?: string) {
  return /^(SUN|MON|TUE|WED|THU|FRI|SAT|周[一二三四五六日天]|星期[一二三四五六日天]|每周[一二三四五六日天])$/i.test(value?.trim() ?? '');
}
function inferYear(context: Pick<RateImportGlobalDefaults, 'year' | 'quotationDate' | 'effectiveDate' | 'expiryDate'>) {
  const contextualDate = context.quotationDate ?? context.effectiveDate ?? context.expiryDate;
  return context.year ?? (contextualDate ? Number(contextualDate.slice(0, 4)) : undefined) ?? new Date().getUTCFullYear();
}
function monthNumber(value?: string) {
  return ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'].indexOf(upper(value ?? '').slice(0, 3)) + 1;
}
function validDate(yearInput: number | string | undefined, month: number, day: number) {
  const year = Number(yearInput);
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) return undefined;
  const normalized = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  const date = new Date(`${normalized}T00:00:00.000Z`);
  return Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== normalized ? undefined : normalized;
}
function normalizeContainerType(value: string) {
  const normalized = normalizeAlias(value);
  const aliases: Record<string, string> = {
    '20GP': '20GP', '20DC': '20GP', '20STD': '20GP', '20': '20GP', '20GPOF': '20GP', '20尺普柜': '20GP', '20尺柜': '20GP',
    '40GP': '40GP', '40DC': '40GP', '40STD': '40GP', '40': '40GP', '40GPOF': '40GP', '40尺普柜': '40GP', '40尺柜': '40GP',
    '40HQ': '40HQ', '40HC': '40HQ', '40H': '40HQ', '40HQOF': '40HQ', '40尺高柜': '40HQ', '40尺高箱': '40HQ',
    '45HQ': '45HQ', '45HC': '45HQ',
  };
  return aliases[normalized];
}
function parseSurchargeAmount(value?: string, defaultCurrency?: string) {
  const text = value?.trim();
  if (!text || text === '0') return undefined;
  const match = /^([A-Z]{3}|US\$|\$|美金|美元|RMB|人民币|￥|¥|€|欧元)?\s*([0-9][0-9,]*(?:\.\d{1,4})?)(?:\s*\/\s*([A-Z]+))?$/i.exec(text);
  if (!match) return undefined;
  const amount = match[2]!.replace(/,/g, '');
  if (!decimal(amount) || Number(amount) === 0) return undefined;
  const currency = normalizeCurrency(match[1]) ?? defaultCurrency;
  if (!currency) return undefined;
  const basisAlias = upper(match[3] ?? 'CNTR');
  const basis: NormalizedRateImportCharge['chargeBasis'] = basisAlias === 'BL'
    ? 'PER_BL'
    : basisAlias === 'SHIPMENT' || basisAlias === '票'
      ? 'PER_SHIPMENT'
      : 'PER_CONTAINER';
  return { amount, currency, basis };
}
function buildRemark(values: Partial<Record<RateImportTargetField, string>>) {
  const parts = [optional(values.remark)];
  if (values.sailingPattern) parts.push(`Schedule: ${values.sailingPattern}`);
  const freeTime = [values.freeTime, values.freeTimeDemurrage ? `${values.freeTimeDemurrage} DEM` : undefined, values.freeTimeDetention ? `${values.freeTimeDetention} DET` : undefined].filter(Boolean).join(' / ');
  if (freeTime) parts.push(`Free time: ${freeTime}`);
  if (values.commodityRestriction) parts.push(`Commodity: ${values.commodityRestriction}`);
  return parts.filter(Boolean).join(' | ') || undefined;
}
