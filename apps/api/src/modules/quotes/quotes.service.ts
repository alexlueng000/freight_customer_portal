import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { CustomerStatus, Prisma, QuoteStatus, RateStatus, RoleCode } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service.js';
import { RequestContextService } from '../../shared/request-context/request-context.service.js';
import { CustomerRatePricingService } from '../rates/customer-rate-pricing.service.js';
import type { CreateQuoteDto } from './dto/create-quote.dto.js';
import type { ListQuotesDto } from './dto/list-quotes.dto.js';
import type { OverrideQuotePricesDto } from './dto/override-quote-prices.dto.js';
import type { RejectQuoteDto } from './dto/reject-quote.dto.js';
import type { UpdateQuoteReviewDto } from './dto/update-quote-review.dto.js';
import { QuoteStateMachine } from './quote-state-machine.js';

const publicQuoteSelect = {
  id: true,
  quoteNo: true,
  status: true,
  polCode: true,
  podCode: true,
  carrierCode: true,
  etd: true,
  validUntil: true,
  currency: true,
  subtotal: true,
  totalAmount: true,
  customerTerms: true,
  sentAt: true,
  acceptedAt: true,
  bookedAt: true,
  version: true,
  createdAt: true,
} satisfies Prisma.QuoteSelect;
const expirableStatuses: readonly QuoteStatus[] = [
  QuoteStatus.DRAFT,
  QuoteStatus.SENT,
  QuoteStatus.VIEWED,
];
const draftQuoteStatuses = [QuoteStatus.DRAFT] as const;

@Injectable()
export class QuotesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly requestContext: RequestContextService,
    private readonly pricing: CustomerRatePricingService,
    private readonly stateMachine: QuoteStateMachine,
  ) {}

  async create(dto: CreateQuoteDto) {
    const context = this.requireCustomerContext();
    const customer = await this.prisma.customerCompany.findFirst({
      where: { id: context.customerCompanyId, tenantId: context.tenantId },
      select: {
        id: true,
        status: true,
        salesOwnerId: true,
        defaultMarkupType: true,
        defaultMarkupValue: true,
      },
    });
    if (!customer || customer.status !== CustomerStatus.ACTIVE) {
      throw new ForbiddenException({
        code: 'CUSTOMER_COMPANY_INACTIVE',
        message: 'Customer company is not active',
      });
    }
    const rate = await this.prisma.rate.findFirst({
      where: { id: dto.rateId, tenantId: context.tenantId, status: RateStatus.ACTIVE },
      select: {
        id: true,
        polCode: true,
        podCode: true,
        carrierCode: true,
        etd: true,
        expiryDate: true,
        prices: {
          where: { containerType: dto.containerType },
          select: { containerType: true, costAmount: true, sellAmount: true, currency: true },
          take: 1,
        },
        charges: {
          where: {
            isIncluded: false,
            OR: [
              { chargeBasis: { in: ['PER_BL', 'PER_SHIPMENT'] } },
              { chargeBasis: 'PER_CONTAINER', containerType: dto.containerType },
            ],
          },
          select: {
            chargeCode: true,
            chargeName: true,
            chargeBasis: true,
            containerType: true,
            amount: true,
            currency: true,
          },
          orderBy: { chargeCode: 'asc' },
        },
      },
    });
    if (!rate)
      throw this.fieldError('RATE_NOT_AVAILABLE', '该运价已失效，请重新查询最新运价。', {
        rateId: ['请选择仍然有效的运价。'],
        containerType: ['该箱型可能不适用于当前运价。'],
      });
    const price = rate.prices[0];
    if (!price)
      throw this.fieldError('RATE_PRICE_NOT_AVAILABLE', '该运价不支持所选箱型。', {
        containerType: ['所选箱型没有可用价格，请重新选择。'],
      });
    if (rate.expiryDate < this.today())
      throw this.fieldError('RATE_NOT_AVAILABLE', '该运价已失效，请重新查询最新运价。', {
        rateId: ['该运价已过有效期。'],
      });
    const sellAmount = this.pricing.calculate(
      price.costAmount,
      price.sellAmount,
      customer.defaultMarkupType,
      customer.defaultMarkupValue,
    );
    const containerQuantity = new Prisma.Decimal(dto.quantity);
    const eligibleCharges = rate.charges.filter((charge) => charge.currency === price.currency);
    const oceanFreightAmount = sellAmount.mul(containerQuantity);
    const chargeSnapshots = eligibleCharges.map((charge) => {
      const quantity = new Prisma.Decimal(charge.chargeBasis === 'PER_CONTAINER' ? dto.quantity : 1);
      return { ...charge, quantity, totalAmount: charge.amount.mul(quantity) };
    });
    const totalAmount = chargeSnapshots.reduce(
      (total, charge) => total.plus(charge.totalAmount),
      oceanFreightAmount,
    );
    return this.prisma.$transaction(async (tx) => {
      const now = new Date();
      const yearMonth = `${now.getUTCFullYear()}${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
      const counter = await tx.businessNumberCounter.upsert({
        where: {
          tenantId_type_yearMonth: { tenantId: context.tenantId, type: 'QUOTE', yearMonth },
        },
        create: { tenantId: context.tenantId, type: 'QUOTE', yearMonth, value: 1 },
        update: { value: { increment: 1 } },
        select: { value: true },
      });
      const quoteNo = `QT${yearMonth}${String(counter.value).padStart(6, '0')}`;
      const quote = await tx.quote.create({
        data: {
          tenantId: context.tenantId,
          quoteNo,
          customerCompanyId: customer.id,
          salesOwnerId: customer.salesOwnerId,
          sourceRateId: rate.id,
          polCode: rate.polCode,
          podCode: rate.podCode,
          carrierCode: rate.carrierCode,
          etd: rate.etd,
          validUntil: rate.expiryDate,
          currency: price.currency,
          subtotal: totalAmount,
          totalAmount,
          createdById: context.userId,
          updatedById: context.userId,
          items: {
            create: [
              {
                tenantId: context.tenantId,
                chargeCode: 'OCEAN_FREIGHT',
                chargeName: '海运费',
                chargeBasis: 'PER_CONTAINER',
                containerType: price.containerType,
                quantity: containerQuantity,
                unitPrice: sellAmount,
                amount: oceanFreightAmount,
                currency: price.currency,
                costAmount: price.costAmount,
                sortOrder: 0,
              },
              ...chargeSnapshots.map((charge, index) => ({
                tenantId: context.tenantId,
                chargeCode: charge.chargeCode,
                chargeName: charge.chargeName,
                chargeBasis: charge.chargeBasis,
                containerType: charge.chargeBasis === 'PER_CONTAINER' ? charge.containerType : null,
                quantity: charge.quantity,
                unitPrice: charge.amount,
                amount: charge.totalAmount,
                currency: charge.currency,
                costAmount: charge.amount,
                sortOrder: index + 1,
              })),
            ],
          },
        },
        select: publicQuoteSelect,
      });
      await tx.auditLog.create({
        data: {
          tenantId: context.tenantId,
          actorUserId: context.userId,
          entityType: 'Quote',
          entityId: quote.id,
          action: 'CREATE',
          afterData: {
            quoteNo,
            sourceRateId: rate.id,
            containerType: price.containerType,
            quantity: dto.quantity,
            totalAmount: totalAmount.toString(),
            chargeCount: eligibleCharges.length,
            currency: price.currency,
          },
        },
      });
      return quote;
    });
  }

  async list(query: ListQuotesDto) {
    const context = this.requireCustomerContext();
    const where = { tenantId: context.tenantId, customerCompanyId: context.customerCompanyId };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.quote.findMany({
        where,
        select: publicQuoteSelect,
        orderBy: { createdAt: 'desc' },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.quote.count({ where }),
    ]);
    return {
      items: items.map((item) => this.withEffectiveStatus(item)),
      pagination: {
        page: query.page,
        pageSize: query.pageSize,
        total,
        totalPages: Math.ceil(total / query.pageSize),
      },
    };
  }

  async get(id: string) {
    const context = this.requireCustomerContext();
    await this.expireIfDue(id, context.tenantId, context.customerCompanyId);
    await this.markViewed(id, context.tenantId, context.customerCompanyId);
    const quote = await this.prisma.quote.findFirst({
      where: { id, tenantId: context.tenantId, customerCompanyId: context.customerCompanyId },
      select: {
        ...publicQuoteSelect,
        customer: { select: { name: true } },
        items: {
          select: {
            id: true,
            chargeCode: true,
            chargeName: true,
            chargeBasis: true,
            containerType: true,
            quantity: true,
            unitPrice: true,
            amount: true,
            currency: true,
            sortOrder: true,
          },
          orderBy: { sortOrder: 'asc' },
        },
      },
    });
    if (!quote)
      throw new NotFoundException({ code: 'QUOTE_NOT_FOUND', message: 'Quote not found' });
    return quote;
  }

  async accept(id: string) {
    return this.customerDecision(id, QuoteStatus.ACCEPTED);
  }
  async reject(id: string, dto: RejectQuoteDto = {}) {
    const reason = dto.reason?.trim();
    return this.customerDecision(
      id,
      QuoteStatus.REJECTED,
      reason ? { reason } : {},
    );
  }

  async listInternal(query: ListQuotesDto) {
    const context = this.requireInternalContext();
    const where = this.internalWhere(context);
    const [items, total] = await this.prisma.$transaction([
      this.prisma.quote.findMany({
        where,
        select: { ...publicQuoteSelect, customer: { select: { id: true, name: true } } },
        orderBy: { createdAt: 'desc' },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.quote.count({ where }),
    ]);
    return {
      items: items.map((item) => this.withEffectiveStatus(item)),
      pagination: {
        page: query.page,
        pageSize: query.pageSize,
        total,
        totalPages: Math.ceil(total / query.pageSize),
      },
    };
  }

  async getInternal(id: string) {
    const context = this.requireInternalContext();
    const where = { id, ...this.internalWhere(context) };
    const quote = await this.prisma.quote.findFirst({
      where,
      select: {
        ...publicQuoteSelect,
        customer: { select: { id: true, name: true } },
        internalNote: true,
        priceOverrideReason: true,
        sentBy: { select: { id: true, displayName: true, email: true } },
        sourceRate: {
          select: {
            id: true,
            rateNo: true,
            serviceName: true,
            supplierName: true,
            contractNo: true,
            effectiveDate: true,
            expiryDate: true,
            transitDays: true,
          },
        },
        items: {
          select: {
            id: true,
            chargeCode: true,
            chargeName: true,
            chargeBasis: true,
            containerType: true,
            quantity: true,
            unitPrice: true,
            amount: true,
            currency: true,
            costAmount: true,
            sortOrder: true,
          },
          orderBy: { sortOrder: 'asc' },
        },
      },
    });
    if (!quote)
      throw new NotFoundException({ code: 'QUOTE_NOT_FOUND', message: 'Quote not found' });
    return this.withEffectiveStatus(quote);
  }

  async getPdfJobData(id: string, internal: boolean) {
    const context = internal ? this.requireInternalContext() : this.requireCustomerContext();
    if (!internal) {
      await this.expireIfDue(id, context.tenantId, context.customerCompanyId!);
      await this.markViewed(id, context.tenantId, context.customerCompanyId!);
    }
    const quote = await this.prisma.quote.findFirst({
      where: internal
        ? { id, ...this.internalWhere(context) }
        : { id, tenantId: context.tenantId, customerCompanyId: context.customerCompanyId },
      select: {
        id: true,
        tenantId: true,
        quoteNo: true,
        status: true,
        polCode: true,
        podCode: true,
        carrierCode: true,
        etd: true,
        validUntil: true,
        currency: true,
        totalAmount: true,
        version: true,
        customerTerms: true,
        customer: { select: { name: true } },
        items: {
          select: {
            chargeCode: true,
            chargeName: true,
            chargeBasis: true,
            containerType: true,
            quantity: true,
            unitPrice: true,
            amount: true,
            currency: true,
          },
          orderBy: { sortOrder: 'asc' },
        },
      },
    });
    if (!quote)
      throw new NotFoundException({ code: 'QUOTE_NOT_FOUND', message: 'Quote not found' });
    if (!internal && quote.status === QuoteStatus.DRAFT)
      throw new BadRequestException({
        code: 'QUOTE_NOT_SENT',
        message: 'The quote is awaiting sales confirmation and is not available as a formal PDF',
        details: { fieldErrors: { status: ['销售确认前不能下载正式报价 PDF。'] } },
      });
    return {
      tenantId: quote.tenantId,
      quoteId: quote.id,
      version: quote.version,
      quote: {
        quoteNo: quote.quoteNo,
        status: quote.status,
        polCode: quote.polCode,
        podCode: quote.podCode,
        carrierCode: quote.carrierCode,
        etd: quote.etd?.toISOString() ?? null,
        validUntil: quote.validUntil.toISOString(),
        currency: quote.currency,
        totalAmount: quote.totalAmount.toString(),
        customerTerms: quote.customerTerms,
        version: quote.version,
        customerName: quote.customer.name,
        items: quote.items.map((item) => ({
          ...item,
          quantity: item.quantity.toString(),
          unitPrice: item.unitPrice.toString(),
          amount: item.amount.toString(),
        })),
      },
    };
  }

  async send(id: string) {
    await this.assertSendable(id);
    return this.transition(id, QuoteStatus.SENT, { internal: true });
  }
  async expire(id: string) {
    this.requireInternalContext();
    return this.transition(id, QuoteStatus.EXPIRED, { internal: true, idempotent: true });
  }
  async cancel(id: string) {
    this.requireInternalContext();
    return this.transition(id, QuoteStatus.CANCELLED, { internal: true, idempotent: true });
  }

  async updateReview(id: string, dto: UpdateQuoteReviewDto) {
    const context = this.requireInternalContext();
    const validUntil = dto.validUntil ? this.businessDate(dto.validUntil) : undefined;
    if (dto.validUntil && !validUntil)
      throw this.fieldError('QUOTE_REVIEW_INVALID', '报价审核信息不完整。', {
        validUntil: ['validUntil 必须是有效日期。'],
      });

    await this.prisma.$transaction(async (tx) => {
      const quote = await tx.quote.findFirst({
        where: { id, ...this.internalWhere(context) },
        select: {
          id: true,
          status: true,
          validUntil: true,
          customerTerms: true,
          internalNote: true,
          sourceRate: { select: { expiryDate: true } },
        },
      });
      if (!quote)
        throw new NotFoundException({ code: 'QUOTE_NOT_FOUND', message: 'Quote not found' });
      if (quote.status !== QuoteStatus.DRAFT)
        throw this.fieldError(
          'QUOTE_REVIEW_UPDATE_NOT_ALLOWED',
          '只有待销售确认的报价可以修改审核信息。',
          { status: ['当前报价状态不允许修改审核信息。'] },
        );
      if (validUntil && quote.sourceRate?.expiryDate && validUntil > quote.sourceRate.expiryDate)
        throw this.fieldError(
          'QUOTE_VALID_UNTIL_EXCEEDS_RATE',
          '该报价有效期不能超过来源运价有效期。',
          { validUntil: ['该报价有效期不能超过来源运价有效期。'] },
        );

      const data: Prisma.QuoteUpdateInput = {
        updatedById: context.userId,
        ...(validUntil ? { validUntil } : {}),
        ...(dto.customerTerms === undefined
          ? {}
          : { customerTerms: dto.customerTerms.trim() || null }),
        ...(dto.internalNote === undefined ? {} : { internalNote: dto.internalNote.trim() || null }),
      };
      await tx.quote.update({ where: { id }, data });
      await tx.auditLog.create({
        data: {
          tenantId: context.tenantId,
          actorUserId: context.userId,
          entityType: 'Quote',
          entityId: id,
          action: 'REVIEW_UPDATED',
          beforeData: {
            validUntil: quote.validUntil.toISOString().slice(0, 10),
            customerTerms: quote.customerTerms,
            internalNote: quote.internalNote,
          },
          afterData: {
            validUntil: validUntil?.toISOString().slice(0, 10),
            customerTerms: dto.customerTerms,
            internalNote: dto.internalNote,
          },
        },
      });
    });
    return this.getInternal(id);
  }

  async overridePrices(id: string, dto: OverrideQuotePricesDto) {
    const context = this.requireInternalContext();
    return this.prisma.$transaction(async (tx) => {
      const quote = await tx.quote.findFirst({
        where: { id, ...this.internalWhere(context) },
        include: { items: { orderBy: { sortOrder: 'asc' } } },
      });
      if (!quote)
        throw new NotFoundException({ code: 'QUOTE_NOT_FOUND', message: 'Quote not found' });
      if (!draftQuoteStatuses.includes(quote.status as (typeof draftQuoteStatuses)[number]))
        throw this.fieldError(
          'QUOTE_PRICE_OVERRIDE_NOT_ALLOWED',
          '只有待销售确认的报价可以调整价格。',
          { status: ['当前报价状态不允许改价。'] },
        );
      const requested = new Map(
        dto.items.map((item) => [item.itemId, new Prisma.Decimal(item.unitPrice)]),
      );
      if (
        requested.size !== dto.items.length ||
        [...requested.keys()].some((itemId) => !quote.items.some((item) => item.id === itemId))
      )
        throw this.fieldError(
          'INVALID_QUOTE_ITEM',
          '改价明细与当前报价不匹配，请刷新后重试。',
          { items: ['每个改价费用项必须属于当前报价。'] },
        );
      const beforeItems = quote.items.map((item) => ({
        id: item.id,
        unitPrice: item.unitPrice.toString(),
        amount: item.amount.toString(),
      }));
      let total = new Prisma.Decimal(0);
      for (const item of quote.items) {
        const unitPrice = requested.get(item.id) ?? item.unitPrice;
        const amount = unitPrice.mul(item.quantity);
        total = total.plus(amount);
        if (requested.has(item.id))
          await tx.quoteItem.update({
            where: { id: item.id },
            data: {
              originalUnitPrice: item.originalUnitPrice ?? item.unitPrice,
              unitPrice,
              amount,
            },
          });
      }
      const updated = await tx.quote.update({
        where: { id },
        data: {
          subtotal: total,
          totalAmount: total,
          version: { increment: 1 },
          priceOverriddenAt: new Date(),
          priceOverriddenById: context.userId,
          priceOverrideReason: dto.reason.trim(),
          updatedById: context.userId,
        },
        select: publicQuoteSelect,
      });
      await tx.auditLog.create({
        data: {
          tenantId: context.tenantId,
          actorUserId: context.userId,
          entityType: 'Quote',
          entityId: id,
          action: 'PRICE_OVERRIDE',
          beforeData: { totalAmount: quote.totalAmount.toString(), items: beforeItems },
          afterData: {
            totalAmount: total.toString(),
            reason: dto.reason.trim(),
            items: quote.items.map((item) => ({
              id: item.id,
              unitPrice: (requested.get(item.id) ?? item.unitPrice).toString(),
            })),
          },
        },
      });
      return updated;
    });
  }

  private async customerDecision(
    id: string,
    target: typeof QuoteStatus.ACCEPTED | typeof QuoteStatus.REJECTED,
    auditData: { reason?: string } = {},
  ) {
    const context = this.requireCustomerContext();
    await this.expireIfDue(id, context.tenantId, context.customerCompanyId);
    return this.transition(id, target, {
      customerCompanyId: context.customerCompanyId,
      idempotent: true,
      auditData,
    });
  }

  private async transition(
    id: string,
    target: QuoteStatus,
    options: {
      customerCompanyId?: string;
      internal?: boolean;
      idempotent?: boolean;
      auditData?: Prisma.InputJsonObject;
    },
  ) {
    const context = this.requestContext.requireAuthenticated();
    return this.prisma.$transaction(async (tx) => {
      const where = options.internal
        ? { id, ...this.internalWhere(context) }
        : { id, tenantId: context.tenantId, customerCompanyId: options.customerCompanyId };
      const quote = await tx.quote.findFirst({
        where,
        select: { id: true, status: true, quoteNo: true, validUntil: true },
      });
      if (!quote)
        throw new NotFoundException({ code: 'QUOTE_NOT_FOUND', message: 'Quote not found' });
      if (quote.status === target && options.idempotent)
        return tx.quote.findUniqueOrThrow({ where: { id }, select: publicQuoteSelect });
      if (!this.stateMachine.canTransition(quote.status, target))
        throw new BadRequestException({
          code: 'ILLEGAL_QUOTE_TRANSITION',
          message: `Quote cannot transition from ${quote.status} to ${target}`,
          details: { from: quote.status, to: target },
        });
      const updated = await tx.quote.updateMany({
        where: { id, tenantId: context.tenantId, status: quote.status },
        data: {
          status: target,
          updatedById: context.userId,
          ...(target === QuoteStatus.SENT ? { sentAt: new Date(), sentById: context.userId } : {}),
          ...(target === QuoteStatus.ACCEPTED ? { acceptedAt: new Date() } : {}),
        },
      });
      if (updated.count !== 1) {
        const current = await tx.quote.findUniqueOrThrow({
          where: { id },
          select: { status: true },
        });
        if (current.status === target && options.idempotent)
          return tx.quote.findUniqueOrThrow({ where: { id }, select: publicQuoteSelect });
        throw new BadRequestException({
          code: 'QUOTE_STATE_CONFLICT',
          message: 'Quote status changed; refresh and try again',
        });
      }
      await tx.auditLog.create({
        data: {
          tenantId: context.tenantId,
          actorUserId: context.userId,
          entityType: 'Quote',
          entityId: id,
          action: `STATUS_${target}`,
          beforeData: { status: quote.status },
          afterData: { status: target, ...(options.auditData ?? {}) },
        },
      });
      return tx.quote.findUniqueOrThrow({ where: { id }, select: publicQuoteSelect });
    });
  }

  private async expireIfDue(id: string, tenantId: string, customerCompanyId: string) {
    const quote = await this.prisma.quote.findFirst({
      where: { id, tenantId, customerCompanyId },
      select: { status: true, validUntil: true },
    });
    if (quote && quote.validUntil < this.today() && expirableStatuses.includes(quote.status))
      await this.transition(id, QuoteStatus.EXPIRED, { customerCompanyId, idempotent: true });
  }

  private async markViewed(id: string, tenantId: string, customerCompanyId: string) {
    const quote = await this.prisma.quote.findFirst({
      where: { id, tenantId, customerCompanyId },
      select: { status: true },
    });
    if (quote?.status === QuoteStatus.SENT)
      await this.transition(id, QuoteStatus.VIEWED, { customerCompanyId, idempotent: true });
  }

  private withEffectiveStatus<T extends { status: QuoteStatus; validUntil: Date }>(quote: T): T {
    return quote.validUntil < this.today() && expirableStatuses.includes(quote.status)
      ? { ...quote, status: QuoteStatus.EXPIRED }
      : quote;
  }

  private async assertSendable(id: string) {
    const context = this.requireInternalContext();
    const quote = await this.prisma.quote.findFirst({
      where: { id, ...this.internalWhere(context) },
      select: {
        status: true,
        validUntil: true,
        sourceRate: { select: { expiryDate: true } },
        items: { select: { id: true, unitPrice: true, quantity: true } },
      },
    });
    if (!quote)
      throw new NotFoundException({ code: 'QUOTE_NOT_FOUND', message: 'Quote not found' });

    const fieldErrors: Record<string, string[]> = {};
    if (quote.status !== QuoteStatus.DRAFT)
      fieldErrors.status = ['只有待销售确认的报价可以发送客户。'];
    if (quote.validUntil < this.today())
      fieldErrors.validUntil = ['报价有效期已过，请重新生成或调整报价。'];
    if (quote.sourceRate?.expiryDate && quote.validUntil > quote.sourceRate.expiryDate)
      fieldErrors.validUntil = [
        ...(fieldErrors.validUntil ?? []),
        '报价有效期不能超过来源运价有效期。',
      ];
    if (quote.items.length === 0) fieldErrors.items = ['报价至少需要 1 条费用。'];
    if (quote.items.some((item) => item.unitPrice.lt(0)))
      fieldErrors.items = [...(fieldErrors.items ?? []), '销售价格不能小于 0。'];
    if (quote.items.some((item) => item.quantity.lte(0)))
      fieldErrors.items = [...(fieldErrors.items ?? []), '计费数量必须大于 0。'];
    if (Object.keys(fieldErrors).length)
      throw this.fieldError(
        'QUOTE_SEND_NOT_ALLOWED',
        '报价还不能发送，请先修正表单错误。',
        fieldErrors,
      );
  }

  private requireInternalContext() {
    const context = this.requestContext.requireAuthenticated();
    if (context.customerCompanyId)
      throw new ForbiddenException({
        code: 'INTERNAL_QUOTE_SCOPE_REQUIRED',
        message: 'Internal quote access requires an internal account',
      });
    return context;
  }
  private internalWhere(context: {
    tenantId: string;
    userId: string;
    roles: RoleCode[];
  }): Prisma.QuoteWhereInput {
    if (context.roles.includes(RoleCode.SALES)) {
      return {
        tenantId: context.tenantId,
        OR: [
          { salesOwnerId: context.userId },
          {
            salesOwnerId: null,
            customer: { salesOwnerId: context.userId },
          },
        ],
      };
    }
    return {
      tenantId: context.tenantId,
    };
  }

  private requireCustomerContext() {
    const context = this.requestContext.requireAuthenticated();
    if (!context.customerCompanyId)
      throw new BadRequestException({
        code: 'CUSTOMER_QUOTE_SCOPE_REQUIRED',
        message: 'Customer quote access requires a customer account',
      });
    return { ...context, customerCompanyId: context.customerCompanyId };
  }
  private fieldError(
    code: string,
    message: string,
    fieldErrors: Record<string, string[]>,
  ): BadRequestException {
    return new BadRequestException({ code, message, details: { fieldErrors } });
  }
  private businessDate(value: string) {
    const date = new Date(`${value.slice(0, 10)}T00:00:00.000Z`);
    return Number.isNaN(date.getTime()) ? undefined : date;
  }
  private today() {
    const now = new Date();
    return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  }
}
