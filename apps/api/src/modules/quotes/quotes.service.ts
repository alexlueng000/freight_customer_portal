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
    const price = rate?.prices[0];
    if (!rate || !price || rate.expiryDate < this.today()) {
      throw new BadRequestException({
        code: 'RATE_NOT_AVAILABLE',
        message: 'The selected rate is no longer available',
      });
    }
    const sellAmount = this.pricing.calculate(
      price.costAmount,
      price.sellAmount,
      customer.defaultMarkupType,
      customer.defaultMarkupValue,
    );
    const eligibleCharges = rate.charges.filter((charge) => charge.currency === price.currency);
    const totalAmount = eligibleCharges.reduce(
      (total, charge) => total.plus(charge.amount),
      sellAmount,
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
                containerType: price.containerType,
                quantity: new Prisma.Decimal(1),
                unitPrice: sellAmount,
                amount: sellAmount,
                currency: price.currency,
                costAmount: price.costAmount,
                sortOrder: 0,
              },
              ...eligibleCharges.map((charge, index) => ({
                tenantId: context.tenantId,
                chargeCode: charge.chargeCode,
                chargeName: charge.chargeName,
                containerType: charge.chargeBasis === 'PER_CONTAINER' ? charge.containerType : null,
                quantity: new Prisma.Decimal(1),
                unitPrice: charge.amount,
                amount: charge.amount,
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
  async reject(id: string) {
    return this.customerDecision(id, QuoteStatus.REJECTED);
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
        items: {
          select: {
            id: true,
            chargeCode: true,
            chargeName: true,
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
        customer: { select: { name: true } },
        items: {
          select: {
            chargeCode: true,
            chargeName: true,
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
    this.requireInternalContext();
    return this.transition(id, QuoteStatus.SENT, { internal: true });
  }
  async expire(id: string) {
    this.requireInternalContext();
    return this.transition(id, QuoteStatus.EXPIRED, { internal: true, idempotent: true });
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
      if (quote.status !== QuoteStatus.DRAFT)
        throw new BadRequestException({
          code: 'QUOTE_PRICE_OVERRIDE_NOT_ALLOWED',
          message: 'Only draft quotes can be repriced',
        });
      const requested = new Map(
        dto.items.map((item) => [item.itemId, new Prisma.Decimal(item.unitPrice)]),
      );
      if (
        requested.size !== dto.items.length ||
        [...requested.keys()].some((itemId) => !quote.items.some((item) => item.id === itemId))
      )
        throw new BadRequestException({
          code: 'INVALID_QUOTE_ITEM',
          message: 'Every price override item must belong to this quote',
        });
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
  ) {
    const context = this.requireCustomerContext();
    await this.expireIfDue(id, context.tenantId, context.customerCompanyId);
    return this.transition(id, target, {
      customerCompanyId: context.customerCompanyId,
      idempotent: true,
    });
  }

  private async transition(
    id: string,
    target: QuoteStatus,
    options: { customerCompanyId?: string; internal?: boolean; idempotent?: boolean },
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
          afterData: { status: target },
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
    return {
      tenantId: context.tenantId,
      ...(context.roles.includes(RoleCode.SALES) ? { salesOwnerId: context.userId } : {}),
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
  private today() {
    const now = new Date();
    return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  }
}
