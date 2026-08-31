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
    await prisma.businessNumberCounter.deleteMany({ where: { tenantId } });
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

  it('accepts the Chinese template headers used by the downloaded workbook', async () => {
    const data = await jobData(
      '中文运价模板.xlsx',
      [
        validRow('IMPORT-ZH', '20GP', '850.00'),
        validRow('IMPORT-ZH', '40HQ', '1250.00'),
        validRow('IMPORT-ZH-002', '40GP', '1750.00'),
      ],
      chineseHeaders,
    );
    await processRateImport(prisma, data);
    const importJob = await prisma.rateImportJob.findUniqueOrThrow({
      where: { id: data.importJobId },
    });
    expect(importJob).toMatchObject({
      status: RateImportStatus.COMPLETED,
      totalRows: 3,
      successRows: 3,
      failedRows: 0,
    });
    await expect(
      prisma.rate.count({ where: { tenantId, rateNo: { in: ['IMPORT-ZH', 'IMPORT-ZH-002'] } } }),
    ).resolves.toBe(2);
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

  it('persists a confirmed normalized preview and generates a concurrency-safe rate number', async () => {
    const importJob = await prisma.rateImportJob.create({ data: { tenantId, originalFileName: 'mapped.xlsx', createdById: actorUserId } });
    await processRateImport(prisma, {
      importJobId: importJob.id, tenantId, actorUserId, originalFileName: 'mapped.xlsx', totalRows: 1,
      normalizedRates: [{
        source: { sheet: 'Customer Rates', row: 5 }, sourceRows: [5],
        polCode: 'CNSHA', polName: 'Shanghai', podCode: 'USLAX', podName: 'Los Angeles', carrierCode: 'COSCO',
        effectiveDate: '2026-09-01', expiryDate: '2026-09-30', currency: 'USD', status: 'ACTIVE',
        prices: [{ containerType: '40HQ', costAmount: '1250', sellAmount: '1400', currency: 'USD', sourceColumns: [8, 9] }],
      }],
    });
    const completed = await prisma.rateImportJob.findUniqueOrThrow({ where: { id: importJob.id } });
    expect(completed).toMatchObject({ status: RateImportStatus.COMPLETED, totalRows: 1, successRows: 1 });
    const generated = await prisma.rate.findFirstOrThrow({ where: { tenantId, rateNo: { startsWith: 'RATE' }, prices: { some: { containerType: '40HQ', costAmount: '1250' } } }, include: { prices: true } });
    expect(generated.rateNo).toMatch(/^RATE\d{12}$/);
    expect(generated.prices[0]?.sellAmount?.toString()).toBe('1400');
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
const chineseHeaders = [
  '运价编号',
  '起运港代码',
  '起运港名称',
  '目的港代码',
  '目的港名称',
  '船司代码',
  '航线服务',
  '生效日期',
  '失效日期',
  '预计开船时间',
  '航程天数',
  '供应商名称',
  '合约号',
  '运价币种',
  '状态',
  '箱型',
  '采购成本',
  '标准售价',
  '价格币种',
  '备注',
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
async function jobData(
  originalFileName: string,
  rows: string[][],
  headerRow = headers,
): Promise<RateImportJobData> {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Rates');
  sheet.addRow(headerRow);
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
