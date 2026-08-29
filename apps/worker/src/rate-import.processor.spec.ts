import { PrismaClient, RateImportStatus, UserStatus, UserType } from '@prisma/client';
import ExcelJS from 'exceljs';
import { processRateImport, type RateImportJobData } from './rate-import.processor.js';

const prisma = new PrismaClient();
const runId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`.toUpperCase();
let tenantId: string;
let actorUserId: string;

describe('rate import processor', () => {
  beforeAll(async () => {
    const tenant = await prisma.tenant.create({
      data: { code: `IMPORT-${runId}`, name: 'Import Test Tenant', status: 'ACTIVE' },
    });
    tenantId = tenant.id;
    actorUserId = (
      await prisma.user.create({
        data: {
          tenantId,
          email: `import-${runId}@example.test`,
          passwordHash: 'unused',
          displayName: 'Import User',
          userType: UserType.INTERNAL,
          status: UserStatus.ACTIVE,
        },
      })
    ).id;
  });
  afterAll(async () => {
    await prisma.auditLog.deleteMany({ where: { tenantId } });
    await prisma.ratePrice.deleteMany({ where: { tenantId } });
    await prisma.rate.deleteMany({ where: { tenantId } });
    await prisma.rateImportJob.deleteMany({ where: { tenantId } });
    await prisma.user.deleteMany({ where: { tenantId } });
    await prisma.tenant.delete({ where: { id: tenantId } });
    await prisma.$disconnect();
  });

  it('imports grouped container prices atomically and audits the rate', async () => {
    const data = await jobData('valid.xlsx', [
      validRow('IMPORT-VALID', '20GP', '800.00'),
      validRow('IMPORT-VALID', '40HQ', '1250.00'),
    ]);
    await processRateImport(prisma, data);
    const importJob = await prisma.rateImportJob.findUniqueOrThrow({
      where: { id: data.importJobId },
    });
    expect(importJob).toMatchObject({
      status: RateImportStatus.COMPLETED,
      totalRows: 2,
      successRows: 2,
      failedRows: 0,
    });
    const rate = await prisma.rate.findFirstOrThrow({
      where: { tenantId, rateNo: 'IMPORT-VALID' },
      include: { prices: true },
    });
    expect(rate.prices.map((price) => price.containerType).sort()).toEqual(['20GP', '40HQ']);
    await expect(
      prisma.auditLog.count({ where: { tenantId, entityId: rate.id, action: 'RATE_IMPORTED' } }),
    ).resolves.toBe(1);
  });

  it('returns row errors and writes no rates when any row is invalid', async () => {
    const data = await jobData('invalid.xlsx', [
      validRow('IMPORT-INVALID', '40HQ', '1000'),
      validRow('IMPORT-INVALID', '40HQ', '1100'),
    ]);
    await processRateImport(prisma, data);
    const importJob = await prisma.rateImportJob.findUniqueOrThrow({
      where: { id: data.importJobId },
    });
    expect(importJob.status).toBe(RateImportStatus.FAILED);
    expect(importJob.errors).toEqual(
      expect.arrayContaining([expect.objectContaining({ row: 3, field: 'containerType' })]),
    );
    await expect(
      prisma.rate.count({ where: { tenantId, rateNo: 'IMPORT-INVALID' } }),
    ).resolves.toBe(0);
  });

  it('rejects a rate number already used by the tenant without partial writes', async () => {
    const data = await jobData('duplicate.xlsx', [validRow('IMPORT-VALID', '45HQ', '1600')]);
    await processRateImport(prisma, data);
    const importJob = await prisma.rateImportJob.findUniqueOrThrow({
      where: { id: data.importJobId },
    });
    expect(importJob.status).toBe(RateImportStatus.FAILED);
    expect(importJob.errors).toEqual(
      expect.arrayContaining([expect.objectContaining({ row: 2, field: 'rateNo' })]),
    );
    await expect(prisma.rate.count({ where: { tenantId, rateNo: 'IMPORT-VALID' } })).resolves.toBe(
      1,
    );
  });
});

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
];
function validRow(rateNo: string, containerType: string, costAmount: string) {
  return [
    rateNo,
    'CNSHA',
    'Shanghai',
    'USLAX',
    'Los Angeles',
    'COSCO',
    'Pacific',
    '2026-09-01',
    '2026-09-30',
    '',
    '18',
    'Supplier',
    'SC-2026',
    'USD',
    'ACTIVE',
    containerType,
    costAmount,
    '',
    'USD',
    'Test row',
  ];
}
async function jobData(originalFileName: string, rows: string[][]): Promise<RateImportJobData> {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Rates');
  sheet.addRow(headers);
  rows.forEach((row) => sheet.addRow(row));
  const buffer = Buffer.from(await workbook.xlsx.writeBuffer());
  const importJob = await prisma.rateImportJob.create({
    data: { tenantId, originalFileName, createdById: actorUserId },
  });
  return {
    importJobId: importJob.id,
    tenantId,
    actorUserId,
    originalFileName,
    workbookBase64: buffer.toString('base64'),
  };
}
