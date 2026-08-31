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
    const sheet = workbook.addWorksheet('运价导入', { views: [{ state: 'frozen', ySplit: 1 }] });
    sheet.columns = RATE_IMPORT_COLUMNS.map(({ header, key, width }) => ({ header, key, width }));
    sheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
    sheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF155E75' } };
    sheet.autoFilter = { from: 'A1', to: 'T1' };
    sheet.addRows([
      {
        rateNo: 'RATE-SHA-LAX-001', polCode: 'CNSHA', polName: 'Shanghai', podCode: 'USLAX',
        podName: 'Los Angeles', carrierCode: 'COSCO', serviceName: 'Pacific Express',
        effectiveDate: '2026-09-01', expiryDate: '2026-09-30', etd: '2026-09-05T08:00:00Z',
        transitDays: 18, supplierName: 'Example Supplier', contractNo: 'SC-2026-A', currency: 'USD',
        status: 'ACTIVE', containerType: '20GP', costAmount: 850, sellAmount: 980,
        priceCurrency: 'USD', remark: '同一运价编号的多行会合并为一条运价',
      },
      {
        rateNo: 'RATE-SHA-LAX-001', polCode: 'CNSHA', polName: 'Shanghai', podCode: 'USLAX',
        podName: 'Los Angeles', carrierCode: 'COSCO', serviceName: 'Pacific Express',
        effectiveDate: '2026-09-01', expiryDate: '2026-09-30', etd: '2026-09-05T08:00:00Z',
        transitDays: 18, supplierName: 'Example Supplier', contractNo: 'SC-2026-A', currency: 'USD',
        status: 'ACTIVE', containerType: '40HQ', costAmount: 1250, sellAmount: 1400,
        priceCurrency: 'USD', remark: '一行代表一个箱型价格',
      },
      {
        rateNo: 'RATE-NGB-HAM-001', polCode: 'CNNGB', polName: 'Ningbo', podCode: 'DEHAM',
        podName: 'Hamburg', carrierCode: 'MAEU', serviceName: 'Europe Weekly',
        effectiveDate: '2026-09-10', expiryDate: '2026-10-10', etd: '2026-09-14T10:00:00Z',
        transitDays: 32, supplierName: 'Example Supplier', contractNo: 'SC-2026-B', currency: 'USD',
        status: 'ACTIVE', containerType: '40GP', costAmount: 1750, sellAmount: 1980,
        priceCurrency: 'USD', remark: '示例第二条运价',
      },
    ]);
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
  { header: '运价编号', key: 'rateNo', width: 22 }, { header: '起运港代码', key: 'polCode', width: 14 },
  { header: '起运港名称', key: 'polName', width: 20 }, { header: '目的港代码', key: 'podCode', width: 14 },
  { header: '目的港名称', key: 'podName', width: 20 }, { header: '船司代码', key: 'carrierCode', width: 14 },
  { header: '航线服务', key: 'serviceName', width: 20 }, { header: '生效日期', key: 'effectiveDate', width: 16 },
  { header: '失效日期', key: 'expiryDate', width: 16 }, { header: '预计开船时间', key: 'etd', width: 24 },
  { header: '航程天数', key: 'transitDays', width: 14 }, { header: '供应商名称', key: 'supplierName', width: 22 },
  { header: '合约号', key: 'contractNo', width: 18 }, { header: '运价币种', key: 'currency', width: 12 },
  { header: '状态', key: 'status', width: 12 }, { header: '箱型', key: 'containerType', width: 14 },
  { header: '采购成本', key: 'costAmount', width: 16 }, { header: '标准售价', key: 'sellAmount', width: 16 },
  { header: '价格币种', key: 'priceCurrency', width: 12 }, { header: '备注', key: 'remark', width: 34 },
] as const;
