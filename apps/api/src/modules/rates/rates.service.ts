import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { ChargeBasis, Prisma } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service.js';
import { RequestContextService } from '../../shared/request-context/request-context.service.js';
import type { CreateRateDto } from './dto/create-rate.dto.js';
import type { ListRatesDto } from './dto/list-rates.dto.js';
import type { UpdateRateDto } from './dto/update-rate.dto.js';

const rateSelect = {
  id: true, rateNo: true, polCode: true, polName: true, podCode: true, podName: true,
  carrierCode: true, serviceName: true, effectiveDate: true, expiryDate: true, etd: true,
  transitDays: true, supplierName: true, contractNo: true, currency: true, status: true,
  createdAt: true, updatedAt: true,
  prices: { select: { id: true, containerType: true, costAmount: true, sellAmount: true, currency: true, remark: true }, orderBy: { containerType: 'asc' as const } },
  charges: { select: { id: true, chargeCode: true, chargeName: true, chargeBasis: true, containerType: true, amount: true, currency: true, isIncluded: true }, orderBy: [{ chargeCode: 'asc' as const }, { id: 'asc' as const }] },
} satisfies Prisma.RateSelect;

@Injectable()
export class RatesService {
  constructor(private readonly prisma: PrismaService, private readonly requestContext: RequestContextService) {}

  async list(query: ListRatesDto) {
    const context = this.requireInternalUser();
    const validOn = query.validOn ? this.businessDate(query.validOn) : undefined;
    const where: Prisma.RateWhereInput = {
      tenantId: context.tenantId,
      ...(query.status ? { status: query.status } : {}),
      ...(query.polCode ? { polCode: query.polCode } : {}),
      ...(query.podCode ? { podCode: query.podCode } : {}),
      ...(query.carrierCode ? { carrierCode: query.carrierCode } : {}),
      ...(query.containerType ? { prices: { some: { containerType: query.containerType } } } : {}),
      ...(validOn ? { effectiveDate: { lte: validOn }, expiryDate: { gte: validOn } } : {}),
      ...(query.search ? { OR: [
        { rateNo: { contains: query.search, mode: 'insensitive' } },
        { polName: { contains: query.search, mode: 'insensitive' } },
        { podName: { contains: query.search, mode: 'insensitive' } },
        { supplierName: { contains: query.search, mode: 'insensitive' } },
        { contractNo: { contains: query.search, mode: 'insensitive' } },
      ] } : {}),
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.rate.findMany({ where, select: rateSelect, orderBy: [{ effectiveDate: 'desc' }, { createdAt: 'desc' }], skip: (query.page - 1) * query.pageSize, take: query.pageSize }),
      this.prisma.rate.count({ where }),
    ]);
    return { items, pagination: { page: query.page, pageSize: query.pageSize, total, totalPages: Math.ceil(total / query.pageSize) } };
  }

  async getById(id: string) {
    const context = this.requireInternalUser();
    const rate = await this.prisma.rate.findFirst({ where: { id, tenantId: context.tenantId }, select: rateSelect });
    if (!rate) throw new NotFoundException({ code: 'RATE_NOT_FOUND', message: 'Rate not found' });
    return rate;
  }

  async create(dto: CreateRateDto) {
    const context = this.requireInternalUser();
    this.validate(dto);
    try {
      return await this.prisma.$transaction(async (tx) => {
        const rate = await tx.rate.create({ data: this.createData(dto, context.tenantId, context.userId), select: rateSelect });
        await tx.auditLog.create({ data: { tenantId: context.tenantId, actorUserId: context.userId, entityType: 'Rate', entityId: rate.id, action: 'RATE_CREATED', afterData: this.auditData(rate) } });
        return rate;
      });
    } catch (error) { this.rethrowConflict(error); }
  }

  async update(id: string, dto: UpdateRateDto) {
    const context = this.requireInternalUser();
    const existing = await this.getById(id);
    const merged = { ...existing, ...dto, prices: dto.prices ?? existing.prices.map((p) => ({ ...p, costAmount: p.costAmount.toString(), sellAmount: p.sellAmount?.toString() })), charges: dto.charges ?? existing.charges.map((c) => ({ ...c, amount: c.amount.toString() })) } as CreateRateDto;
    this.validate(merged);
    try {
      return await this.prisma.$transaction(async (tx) => {
        if (dto.prices) await tx.ratePrice.deleteMany({ where: { tenantId: context.tenantId, rateId: id } });
        if (dto.charges) await tx.rateCharge.deleteMany({ where: { tenantId: context.tenantId, rateId: id } });
        const rate = await tx.rate.update({ where: { id }, data: this.updateData(dto, context.tenantId, context.userId), select: rateSelect });
        await tx.auditLog.create({ data: { tenantId: context.tenantId, actorUserId: context.userId, entityType: 'Rate', entityId: rate.id, action: 'RATE_UPDATED', beforeData: this.auditData(existing), afterData: this.auditData(rate) } });
        return rate;
      });
    } catch (error) { this.rethrowConflict(error); }
  }

  private requireInternalUser() {
    const context = this.requestContext.requireAuthenticated();
    if (context.customerCompanyId) throw new BadRequestException({ code: 'RATE_ADMIN_SCOPE_RESTRICTED', message: 'Customer users cannot access rate administration' });
    return context;
  }

  private validate(dto: CreateRateDto): void {
    if (this.businessDate(dto.effectiveDate) > this.businessDate(dto.expiryDate))
      throw this.fieldError('INVALID_RATE_VALIDITY', 'Effective date must not be after expiry date', {
        expiryDate: ['expiryDate must not be before effectiveDate'],
      });
    const duplicateContainerTypeIndex = this.duplicateContainerTypeIndex(dto.prices);
    if (duplicateContainerTypeIndex >= 0)
      throw this.fieldError('DUPLICATE_CONTAINER_TYPE', 'Each container type may appear only once', {
        [`prices.${duplicateContainerTypeIndex}.containerType`]: [
          'containerType must not be duplicated within a rate',
        ],
      });
    const missingContainerTypeIndex = dto.charges.findIndex(
      (c) => c.chargeBasis === ChargeBasis.PER_CONTAINER && !c.containerType,
    );
    if (missingContainerTypeIndex >= 0)
      throw this.fieldError('INVALID_RATE_CHARGE', 'PER_CONTAINER charge requires containerType', {
        [`charges.${missingContainerTypeIndex}.containerType`]: [
          'containerType is required for PER_CONTAINER charges',
        ],
      });
    const invalidContainerTypeIndex = dto.charges.findIndex(
      (c) => c.chargeBasis !== ChargeBasis.PER_CONTAINER && c.containerType,
    );
    if (invalidContainerTypeIndex >= 0)
      throw this.fieldError('INVALID_RATE_CHARGE', 'containerType is only valid for PER_CONTAINER charges', {
        [`charges.${invalidContainerTypeIndex}.containerType`]: [
          'containerType is only valid for PER_CONTAINER charges',
        ],
      });
  }

  private createData(dto: CreateRateDto, tenantId: string, userId: string): Prisma.RateUncheckedCreateInput {
    return { rateNo: dto.rateNo, polCode: dto.polCode, polName: dto.polName, podCode: dto.podCode, podName: dto.podName, carrierCode: dto.carrierCode, serviceName: dto.serviceName, effectiveDate: this.businessDate(dto.effectiveDate), expiryDate: this.businessDate(dto.expiryDate), etd: dto.etd ? new Date(dto.etd) : undefined, transitDays: dto.transitDays, supplierName: dto.supplierName, contractNo: dto.contractNo, currency: dto.currency, status: dto.status, tenantId, createdById: userId, updatedById: userId, prices: { create: dto.prices.map((p) => ({ tenantId, ...p, costAmount: new Prisma.Decimal(p.costAmount), sellAmount: p.sellAmount ? new Prisma.Decimal(p.sellAmount) : undefined })) }, charges: { create: dto.charges.map((c) => ({ tenantId, ...c, amount: new Prisma.Decimal(c.amount) })) } };
  }

  private updateData(dto: UpdateRateDto, tenantId: string, userId: string): Prisma.RateUncheckedUpdateInput {
    return { ...this.scalarData(dto), updatedById: userId, ...(dto.prices ? { prices: { create: dto.prices.map((p) => ({ tenantId, ...p, costAmount: new Prisma.Decimal(p.costAmount), sellAmount: p.sellAmount ? new Prisma.Decimal(p.sellAmount) : undefined })) } } : {}), ...(dto.charges ? { charges: { create: dto.charges.map((c) => ({ tenantId, ...c, amount: new Prisma.Decimal(c.amount) })) } } : {}) };
  }

  private scalarData(dto: UpdateRateDto) {
    const { prices: _prices, charges: _charges, effectiveDate, expiryDate, etd, ...data } = dto;
    void _prices;
    void _charges;
    return { ...data, ...(effectiveDate ? { effectiveDate: this.businessDate(effectiveDate) } : {}), ...(expiryDate ? { expiryDate: this.businessDate(expiryDate) } : {}), ...(etd !== undefined ? { etd: etd ? new Date(etd) : null } : {}) };
  }

  private businessDate(value: string | Date): Date { return value instanceof Date ? value : new Date(`${value.slice(0, 10)}T00:00:00.000Z`); }
  private auditData(rate: Awaited<ReturnType<RatesService['getById']>>): Prisma.InputJsonValue { return { rateNo: rate.rateNo, polCode: rate.polCode, podCode: rate.podCode, carrierCode: rate.carrierCode, effectiveDate: rate.effectiveDate.toISOString().slice(0, 10), expiryDate: rate.expiryDate.toISOString().slice(0, 10), currency: rate.currency, status: rate.status, prices: rate.prices.map((p) => ({ containerType: p.containerType, costAmount: p.costAmount.toString(), sellAmount: p.sellAmount?.toString() ?? null, currency: p.currency })), charges: rate.charges.map((c) => ({ chargeCode: c.chargeCode, chargeBasis: c.chargeBasis, containerType: c.containerType, amount: c.amount.toString(), currency: c.currency, isIncluded: c.isIncluded })) }; }
  private fieldError(
    code: string,
    message: string,
    fieldErrors: Record<string, string[]>,
  ): BadRequestException {
    return new BadRequestException({ code, message, details: { fieldErrors } });
  }
  private duplicateContainerTypeIndex(prices: CreateRateDto['prices']): number {
    const seen = new Set<string>();
    return prices.findIndex((price) => {
      if (seen.has(price.containerType)) return true;
      seen.add(price.containerType);
      return false;
    });
  }
  private rethrowConflict(error: unknown): never {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002')
      throw new ConflictException({
        code: 'RATE_NUMBER_EXISTS',
        message: 'Rate number already exists in this tenant',
        details: { fieldErrors: { rateNo: ['rateNo must be unique within tenant'] } },
      });
    throw error;
  }
}
