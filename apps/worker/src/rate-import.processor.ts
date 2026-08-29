import { Prisma, RateImportStatus, RateStatus } from '@prisma/client';
import type { PrismaClient } from '@prisma/client';
import ExcelJS from 'exceljs';

export const RATE_IMPORT_QUEUE = 'rate-imports';
export const RATE_IMPORT_JOB = 'process-rate-import';
export interface RateImportJobData {
  importJobId: string;
  tenantId: string;
  actorUserId: string;
  originalFileName: string;
  workbookBase64: string;
}
interface RowError {
  row: number;
  field: string;
  message: string;
}
interface ParsedRow {
  row: number;
  rateNo: string;
  polCode: string;
  polName: string;
  podCode: string;
  podName: string;
  carrierCode: string;
  serviceName?: string;
  effectiveDate: Date;
  expiryDate: Date;
  etd?: Date;
  transitDays?: number;
  supplierName?: string;
  contractNo?: string;
  currency: string;
  status: RateStatus;
  containerType: string;
  costAmount: string;
  sellAmount?: string;
  priceCurrency: string;
  remark?: string;
}

const headers = [
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
] as const;
const required = new Set<(typeof headers)[number]>([
  'rateNo',
  'polCode',
  'polName',
  'podCode',
  'podName',
  'carrierCode',
  'effectiveDate',
  'expiryDate',
  'currency',
  'status',
  'containerType',
  'costAmount',
  'priceCurrency',
]);

export async function processRateImport(prisma: PrismaClient, data: RateImportJobData) {
  const importJob = await prisma.rateImportJob.findFirst({
    where: { id: data.importJobId, tenantId: data.tenantId },
  });
  if (!importJob || importJob.status === RateImportStatus.COMPLETED) return;
  await prisma.rateImportJob.update({
    where: { id: data.importJobId },
    data: {
      status: RateImportStatus.PROCESSING,
      startedAt: importJob.startedAt ?? new Date(),
      completedAt: null,
      errorMessage: null,
    },
  });
  try {
    const { rows, errors, totalRows } = await parseWorkbook(
      Buffer.from(data.workbookBase64, 'base64'),
    );
    await validateDatabaseDuplicates(prisma, data.tenantId, rows, errors);
    validateGroupedRates(rows, errors);
    if (errors.length) {
      await prisma.rateImportJob.update({
        where: { id: data.importJobId },
        data: {
          status: RateImportStatus.FAILED,
          totalRows,
          failedRows: new Set(errors.map((error) => error.row)).size,
          errors: errors.slice(0, 500) as unknown as Prisma.InputJsonValue,
          errorMessage: `Import validation failed with ${errors.length} error(s)`,
          completedAt: new Date(),
        },
      });
      return;
    }
    const grouped = groupRows(rows);
    await prisma.$transaction(
      async (tx) => {
        for (const group of grouped.values()) {
          const first = group[0];
          if (!first) continue;
          const rate = await tx.rate.create({
            data: {
              tenantId: data.tenantId,
              rateNo: first.rateNo,
              polCode: first.polCode,
              polName: first.polName,
              podCode: first.podCode,
              podName: first.podName,
              carrierCode: first.carrierCode,
              serviceName: first.serviceName,
              effectiveDate: first.effectiveDate,
              expiryDate: first.expiryDate,
              etd: first.etd,
              transitDays: first.transitDays,
              supplierName: first.supplierName,
              contractNo: first.contractNo,
              currency: first.currency,
              status: first.status,
              createdById: data.actorUserId,
              updatedById: data.actorUserId,
              prices: {
                create: group.map((row) => ({
                  tenantId: data.tenantId,
                  containerType: row.containerType,
                  costAmount: new Prisma.Decimal(row.costAmount),
                  sellAmount: row.sellAmount ? new Prisma.Decimal(row.sellAmount) : undefined,
                  currency: row.priceCurrency,
                  remark: row.remark,
                })),
              },
            },
          });
          await tx.auditLog.create({
            data: {
              tenantId: data.tenantId,
              actorUserId: data.actorUserId,
              entityType: 'Rate',
              entityId: rate.id,
              action: 'RATE_IMPORTED',
              afterData: {
                importJobId: data.importJobId,
                rateNo: first.rateNo,
                priceRows: group.length,
              },
            },
          });
        }
        await tx.rateImportJob.update({
          where: { id: data.importJobId },
          data: {
            status: RateImportStatus.COMPLETED,
            totalRows,
            successRows: totalRows,
            failedRows: 0,
            errors: Prisma.JsonNull,
            completedAt: new Date(),
          },
        });
      },
      { timeout: 60_000 },
    );
  } catch (error) {
    await prisma.rateImportJob.update({
      where: { id: data.importJobId },
      data: {
        status: RateImportStatus.FAILED,
        errorMessage:
          error instanceof Error ? error.message.slice(0, 1000) : 'Unknown import error',
        completedAt: new Date(),
      },
    });
    throw error;
  }
}

async function parseWorkbook(buffer: Buffer) {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer as unknown as ExcelJS.Buffer);
  const sheet = workbook.worksheets[0];
  if (!sheet)
    return {
      rows: [],
      errors: [{ row: 1, field: 'workbook', message: 'Workbook must contain a worksheet' }],
      totalRows: 0,
    };
  const actualHeaders = headers.map((_, index) => text(sheet.getRow(1).getCell(index + 1).value));
  const errors: RowError[] = [];
  headers.forEach((header, index) => {
    if (actualHeaders[index] !== header)
      errors.push({
        row: 1,
        field: header,
        message: `Expected column ${index + 1} to be ${header}`,
      });
  });
  const totalRows = Math.max(0, sheet.actualRowCount - 1);
  if (totalRows > 5000)
    errors.push({
      row: 1,
      field: 'workbook',
      message: 'A single import cannot exceed 5000 data rows',
    });
  const rows: ParsedRow[] = [];
  for (let rowNumber = 2; rowNumber <= sheet.actualRowCount && rowNumber <= 5001; rowNumber += 1) {
    const row = sheet.getRow(rowNumber);
    if (!row.hasValues) continue;
    const values = Object.fromEntries(
      headers.map((header, index) => [header, cellValue(row.getCell(index + 1).value)]),
    ) as Record<(typeof headers)[number], string>;
    for (const field of required)
      if (!values[field]) errors.push({ row: rowNumber, field, message: `${field} is required` });
    const effectiveDate = dateValue(values.effectiveDate);
    const expiryDate = dateValue(values.expiryDate);
    const etd = values.etd ? dateTimeValue(values.etd) : undefined;
    if (values.effectiveDate && !effectiveDate)
      errors.push({ row: rowNumber, field: 'effectiveDate', message: 'Use yyyy-mm-dd' });
    if (values.expiryDate && !expiryDate)
      errors.push({ row: rowNumber, field: 'expiryDate', message: 'Use yyyy-mm-dd' });
    if (effectiveDate && expiryDate && effectiveDate > expiryDate)
      errors.push({
        row: rowNumber,
        field: 'expiryDate',
        message: 'expiryDate must not be before effectiveDate',
      });
    if (values.etd && !etd)
      errors.push({ row: rowNumber, field: 'etd', message: 'Use an ISO date-time value' });
    validatePattern(errors, rowNumber, 'rateNo', values.rateNo, /^[A-Z0-9][A-Z0-9_-]{0,49}$/);
    validatePattern(errors, rowNumber, 'polCode', values.polCode, /^[A-Z0-9]{3,10}$/);
    validatePattern(errors, rowNumber, 'podCode', values.podCode, /^[A-Z0-9]{3,10}$/);
    validatePattern(errors, rowNumber, 'carrierCode', values.carrierCode, /^[A-Z0-9]{2,20}$/);
    validatePattern(errors, rowNumber, 'containerType', values.containerType, /^[A-Z0-9]{2,20}$/);
    validatePattern(errors, rowNumber, 'currency', values.currency, /^[A-Z]{3}$/);
    validatePattern(errors, rowNumber, 'priceCurrency', values.priceCurrency, /^[A-Z]{3}$/);
    if (!Object.values(RateStatus).includes(values.status as RateStatus))
      errors.push({
        row: rowNumber,
        field: 'status',
        message: 'status must be DRAFT, ACTIVE, EXPIRED, or INACTIVE',
      });
    if (values.costAmount && !decimal(values.costAmount))
      errors.push({
        row: rowNumber,
        field: 'costAmount',
        message: 'Use a non-negative number with at most 4 decimals',
      });
    if (values.sellAmount && !decimal(values.sellAmount))
      errors.push({
        row: rowNumber,
        field: 'sellAmount',
        message: 'Use a non-negative number with at most 4 decimals',
      });
    const transitDays = values.transitDays ? Number(values.transitDays) : undefined;
    if (
      transitDays !== undefined &&
      (!Number.isInteger(transitDays) || transitDays < 0 || transitDays > 365)
    )
      errors.push({
        row: rowNumber,
        field: 'transitDays',
        message: 'transitDays must be an integer from 0 to 365',
      });
    if (
      effectiveDate &&
      expiryDate &&
      requiredFieldsPresent(values) &&
      !errors.some((error) => error.row === rowNumber)
    )
      rows.push({
        row: rowNumber,
        rateNo: upper(values.rateNo),
        polCode: upper(values.polCode),
        polName: values.polName,
        podCode: upper(values.podCode),
        podName: values.podName,
        carrierCode: upper(values.carrierCode),
        serviceName: optional(values.serviceName),
        effectiveDate,
        expiryDate,
        etd,
        transitDays,
        supplierName: optional(values.supplierName),
        contractNo: optional(values.contractNo),
        currency: upper(values.currency),
        status: values.status as RateStatus,
        containerType: upper(values.containerType),
        costAmount: values.costAmount,
        sellAmount: optional(values.sellAmount),
        priceCurrency: upper(values.priceCurrency),
        remark: optional(values.remark),
      });
  }
  return { rows, errors, totalRows };
}

async function validateDatabaseDuplicates(
  prisma: PrismaClient,
  tenantId: string,
  rows: ParsedRow[],
  errors: RowError[],
) {
  const rateNumbers = [...new Set(rows.map((row) => row.rateNo))];
  const existing = await prisma.rate.findMany({
    where: { tenantId, rateNo: { in: rateNumbers } },
    select: { rateNo: true },
  });
  const existingNumbers = new Set(existing.map((rate) => rate.rateNo));
  rows
    .filter((row) => existingNumbers.has(row.rateNo))
    .forEach((row) =>
      errors.push({
        row: row.row,
        field: 'rateNo',
        message: 'rateNo already exists in this tenant',
      }),
    );
}
function validateGroupedRates(rows: ParsedRow[], errors: RowError[]) {
  for (const group of groupRows(rows).values()) {
    const first = group[0];
    if (!first) continue;
    const seen = new Set<string>();
    for (const row of group) {
      if (seen.has(row.containerType))
        errors.push({
          row: row.row,
          field: 'containerType',
          message: 'containerType is duplicated for this rateNo',
        });
      seen.add(row.containerType);
      const signature = [
        row.polCode,
        row.polName,
        row.podCode,
        row.podName,
        row.carrierCode,
        row.effectiveDate.toISOString(),
        row.expiryDate.toISOString(),
        row.currency,
        row.status,
      ].join('|');
      const firstSignature = [
        first.polCode,
        first.polName,
        first.podCode,
        first.podName,
        first.carrierCode,
        first.effectiveDate.toISOString(),
        first.expiryDate.toISOString(),
        first.currency,
        first.status,
      ].join('|');
      if (signature !== firstSignature)
        errors.push({
          row: row.row,
          field: 'rateNo',
          message:
            'Rows sharing rateNo must use the same route, carrier, validity, currency, and status',
        });
    }
  }
}
function groupRows(rows: ParsedRow[]) {
  const grouped = new Map<string, ParsedRow[]>();
  for (const row of rows) grouped.set(row.rateNo, [...(grouped.get(row.rateNo) ?? []), row]);
  return grouped;
}
function cellValue(value: ExcelJS.CellValue): string {
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'object' && value) {
    if ('result' in value) return text(value.result);
    if ('text' in value && typeof value.text === 'string') return value.text.trim();
    return '';
  }
  return text(value);
}
function text(value: unknown) {
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint')
    return String(value).trim();
  return '';
}
function upper(value: string) {
  return value.trim().toUpperCase();
}
function optional(value: string) {
  return value.trim() || undefined;
}
function decimal(value: string) {
  return /^\d{1,14}(?:\.\d{1,4})?$/.test(value);
}
function requiredFieldsPresent(values: Record<string, string>) {
  return [...required].every((field) => Boolean(values[field]));
}
function dateValue(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  if (!match) return undefined;
  const date = new Date(`${match[1]}-${match[2]}-${match[3]}T00:00:00.000Z`);
  return Number.isNaN(date.getTime()) ? undefined : date;
}
function dateTimeValue(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date;
}
function validatePattern(
  errors: RowError[],
  row: number,
  field: string,
  value: string,
  pattern: RegExp,
) {
  if (value && !pattern.test(upper(value)))
    errors.push({ row, field, message: `${field} has an invalid format` });
}
