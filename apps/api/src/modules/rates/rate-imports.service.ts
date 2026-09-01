import { BadRequestException, ConflictException, GoneException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, RateImportStatus } from '@prisma/client';
import ExcelJS from 'exceljs';
import { PrismaService } from '../../database/prisma.service.js';
import { RequestContextService } from '../../shared/request-context/request-context.service.js';
import { RateImportQueueService } from './rate-import-queue.service.js';
import { analyzeRateImportWorkbook, RATE_IMPORT_TARGET_FIELDS } from './rate-import-workbook-analyzer.js';
import { previewRateImportWorkbook, type RateImportPreviewConfig } from './rate-import-normalizer.js';
import type { CreateRateImportMappingProfileDto } from './dto/create-rate-import-mapping-profile.dto.js';
import { RateImportPreviewStoreService } from './rate-import-preview-store.service.js';
import type { ConfirmRateImportDto } from './dto/confirm-rate-import.dto.js';
import { randomUUID } from 'node:crypto';

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
    private readonly previewStore: RateImportPreviewStoreService,
  ) {}

  async create(file: Express.Multer.File | undefined) {
    const context = this.requireInternal();
    this.validateFile(file);

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

  async analyze(file: Express.Multer.File | undefined) {
    this.requireInternal();
    this.validateFile(file);
    return analyzeRateImportWorkbook(file.originalname.slice(0, 255), file.buffer);
  }

  async preview(file: Express.Multer.File | undefined, rawConfiguration: string | undefined) {
    const context = this.requireInternal();
    this.validateFile(file);
    if (!rawConfiguration) {
      throw new BadRequestException({ code: 'RATE_IMPORT_PREVIEW_CONFIG_REQUIRED', message: '请先确认 Sheet、表头和字段 Mapping。' });
    }
    let configuration: RateImportPreviewConfig;
    try {
      configuration = JSON.parse(rawConfiguration) as RateImportPreviewConfig;
    } catch {
      throw new BadRequestException({ code: 'RATE_IMPORT_PREVIEW_CONFIG_INVALID', message: '预览配置不是有效的 JSON。' });
    }
    this.validateMappings(configuration.mappings);
    const preview = await previewRateImportWorkbook(file.buffer, configuration);
    const stored = await this.previewStore.save({
      tenantId: context.tenantId,
      userId: context.userId,
      originalFileName: file.originalname.slice(0, 255),
      workbookBase64: file.buffer.toString('base64'),
      configuration,
      preview,
    });
    return { ...preview, rates: preview.rates.slice(0, 100), ...stored };
  }

  async confirmPreview(dto: ConfirmRateImportDto) {
    const context = this.requireInternal();
    const stored = await this.previewStore.get(dto.previewToken, context.tenantId, context.userId);
    if (!stored) throw new GoneException({ code: 'RATE_IMPORT_PREVIEW_EXPIRED', message: '预览已过期或不属于当前用户，请重新生成。' });
    if (stored.preview.summary.errorCount > 0) throw new BadRequestException({ code: 'RATE_IMPORT_PREVIEW_HAS_ERRORS', message: '预览仍包含 Error，修正 Excel 或 Mapping 后才能导入。' });
    if (stored.preview.summary.warningCount > 0 && !dto.acceptWarnings) throw new BadRequestException({ code: 'RATE_IMPORT_WARNINGS_NOT_ACCEPTED', message: '请明确确认预览中的 Warning 后继续。' });
    const claim = await this.previewStore.claim(dto.previewToken, context.tenantId, context.userId, randomUUID());
    if (claim.status === 'NOT_FOUND') throw new GoneException({ code: 'RATE_IMPORT_PREVIEW_EXPIRED', message: '预览已过期，请重新生成。' });
    const importJob = await this.prisma.rateImportJob.upsert({
      where: { id: claim.importJobId },
      create: { id: claim.importJobId, tenantId: context.tenantId, originalFileName: stored.originalFileName, createdById: context.userId },
      update: {},
      select: importSelect,
    });
    if (importJob.status === RateImportStatus.PENDING) {
      try {
        await this.queue.enqueue({ importJobId: importJob.id, tenantId: context.tenantId, actorUserId: context.userId, originalFileName: stored.originalFileName, normalizedRates: stored.preview.rates, totalRows: stored.preview.rates.reduce((sum, rate) => sum + rate.sourceRows.length, 0) });
      } catch (error) {
        await this.prisma.rateImportJob.update({ where: { id: importJob.id }, data: { status: RateImportStatus.FAILED, errorMessage: 'Unable to enqueue confirmed rate import', completedAt: new Date() } });
        throw error;
      }
    }
    return importJob;
  }

  async listMappingProfiles() {
    const context = this.requireInternal();
    return this.prisma.rateImportMappingProfile.findMany({
      where: { tenantId: context.tenantId },
      select: {
        id: true,
        name: true,
        supplierName: true,
        sheetName: true,
        headerRow: true,
        headerDepth: true,
        mappings: true,
        sourceFingerprint: true,
        updatedAt: true,
      },
      orderBy: [{ updatedAt: 'desc' }, { name: 'asc' }],
    });
  }

  async createMappingProfile(dto: CreateRateImportMappingProfileDto) {
    const context = this.requireInternal();
    this.validateMappings(dto.mappings);
    try {
      const profile = await this.prisma.rateImportMappingProfile.create({
        data: {
          tenantId: context.tenantId,
          name: dto.name.trim(),
          supplierName: dto.supplierName?.trim() || undefined,
          sheetName: dto.sheetName.trim(),
          headerRow: dto.headerRow,
          headerDepth: dto.headerDepth,
          mappings: dto.mappings as unknown as Prisma.InputJsonValue,
          sourceFingerprint: dto.sourceFingerprint?.trim() || undefined,
          createdById: context.userId,
          updatedById: context.userId,
        },
        select: { id: true, name: true, supplierName: true, sheetName: true, headerRow: true, headerDepth: true, mappings: true, sourceFingerprint: true, updatedAt: true },
      });
      await this.prisma.auditLog.create({
        data: {
          tenantId: context.tenantId,
          actorUserId: context.userId,
          entityType: 'RateImportMappingProfile',
          entityId: profile.id,
          action: 'RATE_IMPORT_MAPPING_CREATED',
          afterData: { name: profile.name, sheetName: profile.sheetName, mappingCount: dto.mappings.length },
        },
      });
      return profile;
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException({
          code: 'RATE_IMPORT_MAPPING_NAME_EXISTS',
          message: '当前租户已存在同名 Mapping Profile。',
        });
      }
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
    workbook.creator = 'Freight Customer Portal';
    workbook.created = new Date('2026-09-01T00:00:00.000Z');
    const sheet = workbook.addWorksheet('运价导入', { views: [{ state: 'frozen', ySplit: 1 }] });
    sheet.columns = RATE_IMPORT_V2_RATE_COLUMNS.map(({ header, key, width }) => ({ header, key, width }));
    styleTemplateHeader(sheet, RATE_IMPORT_V2_RATE_COLUMNS.length);
    sheet.autoFilter = { from: 'A1', to: `${columnLetter(RATE_IMPORT_V2_RATE_COLUMNS.length)}1` };
    sheet.addRows([
      {
        importRef: 'R001', rateNo: 'RATE-SHA-LAX-001', polCode: 'CNSHA', polName: 'Shanghai', podCode: 'USLAX',
        podName: 'Los Angeles', carrierCode: 'COSCO', serviceName: 'Pacific Express', transportMode: 'DIRECT',
        effectiveDate: '2026-09-01', expiryDate: '2026-09-30', etd: '2026-09-05 08:00',
        transitDays: 18, supplierName: 'Example Supplier', contractNo: 'SC-2026-A', currency: 'USD',
        priceType: 'BASE', status: 'ACTIVE', price20GpCost: 850, price20GpSell: 980,
        price40GpCost: 1150, price40GpSell: 1300, price40HqCost: 1250, price40HqSell: 1400,
        remark: 'V2 推荐模板：一行一条运价，箱型横向展开',
      },
      {
        importRef: 'R002', polCode: 'CNNGB', polName: 'Ningbo', podCode: 'DEHAM',
        podName: 'Hamburg', carrierCode: 'MAEU', serviceName: 'Europe Weekly', transportMode: 'DIRECT',
        effectiveDate: '2026-09-10', expiryDate: '2026-10-10', etd: '2026-09-14 10:00',
        transitDays: 32, supplierName: 'Example Supplier', contractNo: 'SC-2026-B', currency: 'USD',
        priceType: 'BASE', status: 'DRAFT', price40HqCost: 1750, price40HqSell: 1980,
        remark: '运价编号为空时，确认导入后由系统生成',
      },
    ]);
    applyListValidation(sheet, 'I', ['DIRECT', 'TRANSSHIP']);
    applyListValidation(sheet, 'R', ['USD', 'CNY', 'EUR', 'HKD', 'JPY']);
    applyListValidation(sheet, 'S', ['BASE', 'ALL_IN']);
    applyListValidation(sheet, 'T', ['DRAFT', 'ACTIVE', 'INACTIVE']);
    ['L', 'M'].forEach((column) => sheet.getColumn(column).numFmt = 'yyyy-mm-dd');
    ['U', 'V', 'W', 'X', 'Y', 'Z'].forEach((column) => sheet.getColumn(column).numFmt = '0.0000');

    const surchargeSheet = workbook.addWorksheet('附加费导入', { views: [{ state: 'frozen', ySplit: 1 }] });
    surchargeSheet.columns = RATE_IMPORT_V2_CHARGE_COLUMNS.map(({ header, key, width }) => ({ header, key, width }));
    styleTemplateHeader(surchargeSheet, RATE_IMPORT_V2_CHARGE_COLUMNS.length);
    surchargeSheet.autoFilter = { from: 'A1', to: `${columnLetter(RATE_IMPORT_V2_CHARGE_COLUMNS.length)}1` };
    surchargeSheet.addRows([
      {
        importRef: 'R001', chargeCode: 'AMS', chargeName: 'AMS Fee', costAmount: 25, sellAmount: 35,
        currency: 'USD', chargeBasis: 'PER_BL', containerType: 'ALL', remark: '附加费 Sheet 已预留，解析将在下一步接入',
      },
      {
        importRef: 'R001', chargeCode: 'THC', chargeName: 'Origin THC', costAmount: 650, sellAmount: 720,
        currency: 'CNY', chargeBasis: 'PER_CONTAINER', containerType: '40HQ', remark: '不同币种附加费不得静默合计',
      },
    ]);
    applyListValidation(surchargeSheet, 'F', ['USD', 'CNY', 'EUR', 'HKD', 'JPY']);
    applyListValidation(surchargeSheet, 'G', ['PER_CONTAINER', 'PER_SHIPMENT', 'PER_BL']);
    applyListValidation(surchargeSheet, 'H', ['ALL', '20GP', '40GP', '40HQ', '45HQ']);
    ['D', 'E'].forEach((column) => surchargeSheet.getColumn(column).numFmt = '0.0000');

    const instructionSheet = workbook.addWorksheet('填写说明');
    instructionSheet.columns = [{ header: '项目', key: 'item', width: 24 }, { header: '说明', key: 'description', width: 96 }];
    styleTemplateHeader(instructionSheet, 2);
    instructionSheet.addRows([
      { item: '模板版本', description: 'V2 推荐模板。一行代表一条运价，20GP/40GP/40HQ 价格横向填写。旧版长表模板仍兼容导入。' },
      { item: '导入编号', description: '仅用于当前工作簿内关联附加费，不是系统正式运价编号。附加费正式解析将在后续版本接入。' },
      { item: '运价编号', description: '可为空。为空时，确认导入后系统会生成租户内唯一编号。' },
      { item: '日期', description: '生效日期、失效日期使用 yyyy-mm-dd；ETD 可填写 yyyy-mm-dd 或 yyyy-mm-dd HH:mm。' },
      { item: '确认导入', description: '请先上传并分析工作簿，确认 Sheet、表头和字段 Mapping，预览无 Error 后再确认导入。' },
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

  private validateFile(file: Express.Multer.File | undefined): asserts file is Express.Multer.File {
    if (!file) {
      throw new BadRequestException({ code: 'RATE_IMPORT_FILE_REQUIRED', message: '请选择需要导入的 Excel 文件。' });
    }
    if (!file.originalname.toLowerCase().endsWith('.xlsx')) {
      throw new BadRequestException({ code: 'RATE_IMPORT_FILE_TYPE_INVALID', message: '目前仅支持 .xlsx 文件。' });
    }
    if (!file.buffer.length) {
      throw new BadRequestException({ code: 'RATE_IMPORT_FILE_EMPTY', message: '上传的 Excel 文件为空。' });
    }
  }

  private validateMappings(mappings: CreateRateImportMappingProfileDto['mappings']) {
    if (!Array.isArray(mappings) || !mappings.length || mappings.some((mapping) => !mapping || !Number.isInteger(mapping.sourceColumn) || mapping.sourceColumn < 1 || !RATE_IMPORT_TARGET_FIELDS.includes(mapping.targetField))) {
      throw new BadRequestException({ code: 'RATE_IMPORT_MAPPING_INVALID', message: '字段 Mapping 不完整或包含不支持的字段。' });
    }
    const sourceColumns = mappings.map((mapping) => mapping.sourceColumn);
    const targetFields = mappings.map((mapping) => mapping.targetField);
    if (new Set(sourceColumns).size !== sourceColumns.length) {
      throw new BadRequestException({
        code: 'RATE_IMPORT_MAPPING_SOURCE_DUPLICATE',
        message: '同一 Excel 列不能重复映射。',
      });
    }
    if (new Set(targetFields).size !== targetFields.length) {
      throw new BadRequestException({
        code: 'RATE_IMPORT_MAPPING_TARGET_DUPLICATE',
        message: '同一标准字段不能重复映射。',
      });
    }
  }
}

export const RATE_IMPORT_V2_RATE_COLUMNS = [
  { header: '导入编号', key: 'importRef', width: 12 }, { header: '运价编号', key: 'rateNo', width: 22 },
  { header: '起运港代码', key: 'polCode', width: 14 },
  { header: '起运港名称', key: 'polName', width: 20 }, { header: '目的港代码', key: 'podCode', width: 14 },
  { header: '目的港名称', key: 'podName', width: 20 }, { header: '船司代码', key: 'carrierCode', width: 14 },
  { header: '航线服务', key: 'serviceName', width: 20 }, { header: '运输方式', key: 'transportMode', width: 14 },
  { header: '中转港代码', key: 'transitPortCode', width: 14 }, { header: '中转港名称', key: 'transitPortName', width: 20 },
  { header: '生效日期', key: 'effectiveDate', width: 16 }, { header: '失效日期', key: 'expiryDate', width: 16 }, { header: 'ETD', key: 'etd', width: 20 },
  { header: '航程天数', key: 'transitDays', width: 14 }, { header: '供应商名称', key: 'supplierName', width: 22 },
  { header: '合约号', key: 'contractNo', width: 18 }, { header: '运价币种', key: 'currency', width: 12 },
  { header: '价格类型', key: 'priceType', width: 12 }, { header: '状态', key: 'status', width: 12 },
  { header: '20GP采购成本', key: 'price20GpCost', width: 16 }, { header: '20GP标准售价', key: 'price20GpSell', width: 16 },
  { header: '40GP采购成本', key: 'price40GpCost', width: 16 }, { header: '40GP标准售价', key: 'price40GpSell', width: 16 },
  { header: '40HQ采购成本', key: 'price40HqCost', width: 16 }, { header: '40HQ标准售价', key: 'price40HqSell', width: 16 },
  { header: '备注', key: 'remark', width: 34 },
] as const;

export const RATE_IMPORT_V2_CHARGE_COLUMNS = [
  { header: '导入编号', key: 'importRef', width: 12 }, { header: '费用代码', key: 'chargeCode', width: 14 },
  { header: '费用名称', key: 'chargeName', width: 22 }, { header: '采购成本', key: 'costAmount', width: 14 },
  { header: '标准售价', key: 'sellAmount', width: 14 }, { header: '币种', key: 'currency', width: 10 },
  { header: '计费单位', key: 'chargeBasis', width: 18 }, { header: '适用箱型', key: 'containerType', width: 14 },
  { header: '备注', key: 'remark', width: 36 },
] as const;

function styleTemplateHeader(sheet: ExcelJS.Worksheet, columnCount: number) {
  sheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
  sheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF155E75' } };
  sheet.getRow(1).alignment = { vertical: 'middle', horizontal: 'center' };
  sheet.getRow(1).height = 22;
  for (let column = 1; column <= columnCount; column += 1) {
    sheet.getRow(1).getCell(column).border = { bottom: { style: 'thin', color: { argb: 'FFCBD5E1' } } };
  }
}

function applyListValidation(sheet: ExcelJS.Worksheet, column: string, values: string[]) {
  for (let row = 2; row <= 500; row += 1) {
    sheet.getCell(`${column}${row}`).dataValidation = {
      type: 'list',
      allowBlank: true,
      formulae: [`"${values.join(',')}"`],
    };
  }
}

function columnLetter(index: number) {
  let remaining = index;
  let result = '';
  while (remaining > 0) {
    const modulo = (remaining - 1) % 26;
    result = String.fromCharCode(65 + modulo) + result;
    remaining = Math.floor((remaining - modulo) / 26);
  }
  return result;
}
