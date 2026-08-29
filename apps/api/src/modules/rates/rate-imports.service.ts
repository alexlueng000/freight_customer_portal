import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, RateImportStatus } from '@prisma/client';
import ExcelJS from 'exceljs';
import { PrismaService } from '../../database/prisma.service.js';
import { RequestContextService } from '../../shared/request-context/request-context.service.js';
import { RateImportQueueService } from './rate-import-queue.service.js';

const importSelect = {
  id: true,
  originalFileName: true,
  status: true,
  totalRows: true,
  successRows: true,
  failedRows: true,
  errors: true,
  errorMessage: true,
  startedAt: true,
  completedAt: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.RateImportJobSelect;

@Injectable()
export class RateImportsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly requestContext: RequestContextService,
    private readonly queue: RateImportQueueService,
  ) {}

  async create(file: Express.Multer.File | undefined) {
    const context = this.requireInternal();
    if (!file) {
      throw new BadRequestException({ code: 'RATE_IMPORT_FILE_REQUIRED', message: 'Excel file is required' });
    }
    if (!file.originalname.toLowerCase().endsWith('.xlsx')) {
      throw new BadRequestException({ code: 'RATE_IMPORT_FILE_TYPE_INVALID', message: 'Only .xlsx files are supported' });
    }
    if (!file.buffer.length) {
      throw new BadRequestException({ code: 'RATE_IMPORT_FILE_EMPTY', message: 'Excel file is empty' });
    }

    const importJob = await this.prisma.rateImportJob.create({
      data: {
        tenantId: context.tenantId,
        originalFileName: file.originalname.slice(0, 255),
        createdById: context.userId,
      },
      select: importSelect,
    });
    try {
      await this.queue.enqueue({
        importJobId: importJob.id,
        tenantId: context.tenantId,
        actorUserId: context.userId,
        originalFileName: importJob.originalFileName,
        workbookBase64: file.buffer.toString('base64'),
      });
      return importJob;
    } catch (error) {
      await this.prisma.rateImportJob.update({
        where: { id: importJob.id },
        data: {
          status: RateImportStatus.FAILED,
          errorMessage: 'Unable to enqueue rate import',
          completedAt: new Date(),
        },
      });
      throw error;
    }
  }

  async getById(id: string) {
    const context = this.requireInternal();
    const importJob = await this.prisma.rateImportJob.findFirst({
      where: { id, tenantId: context.tenantId },
      select: importSelect,
    });
    if (!importJob) {
      throw new NotFoundException({ code: 'RATE_IMPORT_NOT_FOUND', message: 'Rate import not found' });
    }
    return importJob;
  }

  async template(): Promise<Buffer> {
    this.requireInternal();
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Rates', { views: [{ state: 'frozen', ySplit: 1 }] });
    sheet.columns = RATE_IMPORT_COLUMNS.map(({ header, key, width }) => ({ header, key, width }));
    sheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
    sheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF155E75' } };
    sheet.autoFilter = { from: 'A1', to: 'T1' };
    sheet.addRow({
      rateNo: 'RATE-EXAMPLE-001', polCode: 'CNSHA', polName: 'Shanghai', podCode: 'USLAX',
      podName: 'Los Angeles', carrierCode: 'COSCO', serviceName: 'Pacific Express',
      effectiveDate: '2026-09-01', expiryDate: '2026-09-30', etd: '2026-09-05T08:00:00Z',
      transitDays: 18, supplierName: 'Example Supplier', contractNo: 'SC-2026', currency: 'USD',
      status: 'ACTIVE', containerType: '40HQ', costAmount: 1250, sellAmount: 1400,
      priceCurrency: 'USD', remark: 'One row per container type',
    });
    const buffer = await workbook.xlsx.writeBuffer();
    return Buffer.from(buffer);
  }

  private requireInternal() {
    const context = this.requestContext.requireAuthenticated();
    if (context.customerCompanyId) {
      throw new BadRequestException({ code: 'RATE_ADMIN_SCOPE_RESTRICTED', message: 'Customer users cannot import rates' });
    }
    return context;
  }
}

export const RATE_IMPORT_COLUMNS = [
  { header: 'rateNo', key: 'rateNo', width: 22 }, { header: 'polCode', key: 'polCode', width: 12 },
  { header: 'polName', key: 'polName', width: 20 }, { header: 'podCode', key: 'podCode', width: 12 },
  { header: 'podName', key: 'podName', width: 20 }, { header: 'carrierCode', key: 'carrierCode', width: 15 },
  { header: 'serviceName', key: 'serviceName', width: 20 }, { header: 'effectiveDate', key: 'effectiveDate', width: 16 },
  { header: 'expiryDate', key: 'expiryDate', width: 16 }, { header: 'etd', key: 'etd', width: 24 },
  { header: 'transitDays', key: 'transitDays', width: 14 }, { header: 'supplierName', key: 'supplierName', width: 22 },
  { header: 'contractNo', key: 'contractNo', width: 18 }, { header: 'currency', key: 'currency', width: 12 },
  { header: 'status', key: 'status', width: 12 }, { header: 'containerType', key: 'containerType', width: 16 },
  { header: 'costAmount', key: 'costAmount', width: 16 }, { header: 'sellAmount', key: 'sellAmount', width: 16 },
  { header: 'priceCurrency', key: 'priceCurrency', width: 16 }, { header: 'remark', key: 'remark', width: 30 },
] as const;
