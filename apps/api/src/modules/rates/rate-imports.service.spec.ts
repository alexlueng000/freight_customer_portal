import type { PrismaService } from '../../database/prisma.service.js';
import ExcelJS from 'exceljs';
import { RequestContextService } from '../../shared/request-context/request-context.service.js';
import type { RateImportQueueService } from './rate-import-queue.service.js';
import type { RateImportPreviewStoreService } from './rate-import-preview-store.service.js';
import { RateImportsService } from './rate-imports.service.js';

describe('RateImportsService mapping profiles', () => {
  const findMany = jest.fn<Promise<unknown[]>, [unknown]>();
  const create = jest.fn<Promise<unknown>, [unknown]>();
  const auditCreate = jest.fn<Promise<unknown>, [unknown]>();
  const importUpsert = jest.fn<Promise<unknown>, [unknown]>();
  const importUpdate = jest.fn<Promise<unknown>, [unknown]>();
  const prisma = {
    rateImportMappingProfile: { findMany, create },
    auditLog: { create: auditCreate },
    rateImportJob: { upsert: importUpsert, update: importUpdate },
  } as unknown as PrismaService;
  const context = new RequestContextService();
  const enqueue = jest.fn();
  const queue = { enqueue } as unknown as RateImportQueueService;
  const previewSave = jest.fn();
  const previewGet = jest.fn();
  const previewClaim = jest.fn();
  const previewStore = { save: previewSave, get: previewGet, claim: previewClaim } as unknown as RateImportPreviewStoreService;
  const service = new RateImportsService(prisma, context, queue, previewStore);

  beforeEach(() => {
    jest.clearAllMocks();
    findMany.mockResolvedValue([]);
    auditCreate.mockResolvedValue({});
    previewSave.mockResolvedValue({ previewToken: 'opaque-token', expiresAt: '2026-09-01T12:30:00.000Z' });
    enqueue.mockResolvedValue({});
  });

  it('lists mapping profiles only inside the authenticated tenant', async () => {
    await context.run(
      { requestId: 'mapping-list', tenantId: 'tenant-a', userId: 'user-a', roles: [] },
      () => service.listMappingProfiles(),
    );

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { tenantId: 'tenant-a' } }),
    );
  });

  it('rejects duplicate target fields before saving a profile', async () => {
    await expect(
      context.run(
        { requestId: 'mapping-create', tenantId: 'tenant-a', userId: 'user-a', roles: [] },
        () =>
          service.createMappingProfile({
            name: 'Supplier A',
            sheetName: 'Rates',
            headerRow: 3,
            headerDepth: 1,
            mappings: [
              { sourceColumn: 1, sourceLabel: 'POL', targetField: 'polName' },
              { sourceColumn: 2, sourceLabel: 'Origin', targetField: 'polName' },
            ],
          }),
      ),
    ).rejects.toMatchObject({ response: { code: 'RATE_IMPORT_MAPPING_TARGET_DUPLICATE' } });
    expect(create).not.toHaveBeenCalled();
  });

  it('stores tenant ownership and writes an audit record', async () => {
    create.mockResolvedValue({
      id: 'profile-a',
      name: 'Supplier A',
      supplierName: 'Supplier A',
      sheetName: 'Rates',
      headerRow: 3,
      headerDepth: 2,
      mappings: [],
      sourceFingerprint: null,
      updatedAt: new Date(),
    });

    await context.run(
      { requestId: 'mapping-create', tenantId: 'tenant-a', userId: 'user-a', roles: [] },
      () =>
        service.createMappingProfile({
          name: 'Supplier A',
          supplierName: 'Supplier A',
          sheetName: 'Rates',
          headerRow: 3,
          headerDepth: 2,
          mappings: [{ sourceColumn: 1, sourceLabel: 'POL', targetField: 'polName' }],
        }),
    );

    const createCall = create.mock.calls[0]?.[0] as
      | { data: { tenantId: string; createdById: string; updatedById: string } }
      | undefined;
    const auditCall = auditCreate.mock.calls[0]?.[0] as
      | { data: { tenantId: string } }
      | undefined;
    expect(createCall?.data).toMatchObject({
      tenantId: 'tenant-a',
      createdById: 'user-a',
      updatedById: 'user-a',
    });
    expect(auditCall?.data).toMatchObject({ tenantId: 'tenant-a' });
  });

  it('binds a saved preview to the authenticated tenant and user', async () => {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Rates');
    sheet.addRow(['POL', 'POD', 'Carrier', 'From', 'To', 'Currency', '20GP']);
    sheet.addRow(['CNSHA', 'USLAX', 'COSCO', '2026-09-01', '2026-09-30', 'USD', 980]);
    const buffer = Buffer.from(await workbook.xlsx.writeBuffer());
    const configuration = {
      sheetName: 'Rates', headerRow: 1, headerDepth: 1,
      mappings: [
        ['polCode', 1], ['podCode', 2], ['carrierCode', 3], ['effectiveDate', 4],
        ['expiryDate', 5], ['currency', 6], ['price20GpSell', 7],
      ].map(([targetField, sourceColumn]) => ({ sourceColumn: Number(sourceColumn), sourceLabel: String(targetField), targetField })),
    };
    const result = await context.run(
      { requestId: 'preview', tenantId: 'tenant-a', userId: 'user-a', roles: [] },
      () => service.preview({ originalname: 'rates.xlsx', buffer } as Express.Multer.File, JSON.stringify(configuration)),
    );

    expect(result.previewToken).toBe('opaque-token');
    expect(previewSave).toHaveBeenCalledWith(expect.objectContaining({ tenantId: 'tenant-a', userId: 'user-a', originalFileName: 'rates.xlsx' }));
  });

  it('blocks confirmation while preview errors remain', async () => {
    previewGet.mockResolvedValue({ preview: { summary: { errorCount: 1, warningCount: 0 } } });
    await expect(context.run(
      { requestId: 'confirm-error', tenantId: 'tenant-a', userId: 'user-a', roles: [] },
      () => service.confirmPreview({ previewToken: 'preview-token-long-enough', acceptWarnings: false }),
    )).rejects.toMatchObject({ response: { code: 'RATE_IMPORT_PREVIEW_HAS_ERRORS' } });
    expect(previewClaim).not.toHaveBeenCalled();
  });

  it('requires explicit warning acceptance and idempotently enqueues the claimed preview', async () => {
    const stored = { originalFileName: 'rates.xlsx', preview: { summary: { errorCount: 0, warningCount: 1 }, rates: [{ sourceRows: [2], prices: [] }] } };
    previewGet.mockResolvedValue(stored);
    await expect(context.run(
      { requestId: 'confirm-warning', tenantId: 'tenant-a', userId: 'user-a', roles: [] },
      () => service.confirmPreview({ previewToken: 'preview-token-long-enough', acceptWarnings: false }),
    )).rejects.toMatchObject({ response: { code: 'RATE_IMPORT_WARNINGS_NOT_ACCEPTED' } });

    previewClaim.mockResolvedValue({ status: 'CLAIMED', importJobId: 'job-a', payload: stored });
    importUpsert.mockResolvedValue({ id: 'job-a', originalFileName: 'rates.xlsx', status: 'PENDING', totalRows: 0, successRows: 0, failedRows: 0 });
    const result = await context.run(
      { requestId: 'confirm-ok', tenantId: 'tenant-a', userId: 'user-a', roles: [] },
      () => service.confirmPreview({ previewToken: 'preview-token-long-enough', acceptWarnings: true }),
    );
    expect(result).toMatchObject({ id: 'job-a' });
    const upsertCall = importUpsert.mock.calls[0]?.[0] as { where?: { id?: string }; create?: { tenantId?: string; createdById?: string } } | undefined;
    expect(upsertCall?.where).toEqual({ id: 'job-a' });
    expect(upsertCall?.create).toMatchObject({ tenantId: 'tenant-a', createdById: 'user-a' });
    expect(enqueue).toHaveBeenCalledWith(expect.objectContaining({ importJobId: 'job-a', tenantId: 'tenant-a', normalizedRates: stored.preview.rates }));
  });
});
