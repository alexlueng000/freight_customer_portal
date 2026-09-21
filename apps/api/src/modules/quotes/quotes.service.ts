import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  Optional,
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
import { quotePricing } from './quote-pricing.js';
import { portDisplayName } from '../rates/port-search.js';
import { customerQuoteFilters } from './quote-list-filters.js';
import { NotificationEventsService } from '../notifications/notification-events.service.js';
import type { EmailNotificationJobData } from '../notifications/notification-queue.service.js';

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
  amountsByCurrency: true,
  containerQuantity: true,
  factoryLoadingDate: true,
  incoterm: true,
  pickupLocationText: true,
  deliveryLocationText: true,
  exportCustomsRemark: true,
  importCustomsRemark: true,
  customerRemarks: true,
  requestedServices: true,
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
    @Optional() private readonly notificationEvents?: NotificationEventsService,
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
    const containerQuantity = new Prisma.Decimal(dto.containerQuantity);
    const eligibleCharges = rate.charges.filter((charge) => charge.currency === price.currency);
    const oceanFreightAmount = sellAmount.mul(containerQuantity);
    const chargeSnapshots = eligibleCharges.map((charge) => {
      const quantity = new Prisma.Decimal(
        charge.chargeBasis === 'PER_CONTAINER' ? dto.containerQuantity : 1,
      );
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
          amountsByCurrency: { [price.currency]: totalAmount.toString() },
          containerQuantity: dto.containerQuantity,
          factoryLoadingDate: dto.factoryLoadingDate ? new Date(`${dto.factoryLoadingDate}T00:00:00.000Z`) : null,
          incoterm: dto.incoterm ?? null,
          pickupLocationText: dto.pickupLocationText?.trim() || null,
          deliveryLocationText: dto.deliveryLocationText?.trim() || null,
          exportCustomsRemark: dto.exportCustomsRemark?.trim() || null,
          importCustomsRemark: dto.importCustomsRemark?.trim() || null,
          customerRemarks: dto.customerRemarks?.trim() || null,
          requestedServices: [...new Set(dto.requestedServices)],
          createdById: context.userId,
          updatedById: context.userId,
          cargoItems: {
            create: dto.cargoItems.map((item, index) => ({
              tenantId: context.tenantId,
              commodity: item.commodity.trim(),
              estimatedGrossWeight:
                item.estimatedGrossWeight === undefined
                  ? null
                  : new Prisma.Decimal(item.estimatedGrossWeight),
              cargoNature: item.cargoNature?.trim() || null,
              specialRequirement: item.specialRequirement?.trim() || null,
              sortOrder: index,
            })),
          },
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
            containerQuantity: dto.containerQuantity,
            factoryLoadingDate: dto.factoryLoadingDate ?? null,
            incoterm: dto.incoterm,
            totalAmount: totalAmount.toString(),
            chargeCount: eligibleCharges.length,
            currency: price.currency,
            cargoItemCount: dto.cargoItems.length,
            cargoItems: dto.cargoItems.map((item) => ({
              commodity: item.commodity.trim(),
              estimatedGrossWeight:
                item.estimatedGrossWeight === undefined ? null : String(item.estimatedGrossWeight),
              cargoNature: item.cargoNature?.trim() || null,
              specialRequirement: item.specialRequirement?.trim() || null,
            })),
            requestedServices: dto.requestedServices,
            pickupLocationText: dto.pickupLocationText,
            deliveryLocationText: dto.deliveryLocationText,
            exportCustomsRemark: dto.exportCustomsRemark,
            importCustomsRemark: dto.importCustomsRemark,
            customerRemarks: dto.customerRemarks,
          },
        },
      });
      return quote;
    });
  }

  async list(query: ListQuotesDto) {
    const context = this.requireCustomerContext();
    const where: Prisma.QuoteWhereInput = {
      ...customerQuoteFilters(query, this.today()),
      tenantId: context.tenantId,
      customerCompanyId: context.customerCompanyId,
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.quote.findMany({
        where,
        select: { ...publicQuoteSelect, sourceRate: { select: { polName: true, podName: true } } },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.quote.count({ where }),
    ]);
    return {
      items: items.map(({ sourceRate, ...item }) => ({
        ...this.toCustomerQuoteSummary(this.withEffectiveStatus(item)),
        polDisplayName: portDisplayName(item.polCode, sourceRate?.polName ?? item.polCode),
        podDisplayName: portDisplayName(item.podCode, sourceRate?.podName ?? item.podCode),
      })),
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
        cargoItems: {
          select: {
            id: true,
            commodity: true,
            estimatedGrossWeight: true,
            cargoNature: true,
            specialRequirement: true,
            sortOrder: true,
          },
          orderBy: { sortOrder: 'asc' },
        },
        bookings: {
          select: {
            id: true,
            status: true,
            shipments: {
              select: { id: true, status: true },
              orderBy: { createdAt: 'desc' },
              take: 1,
            },
          },
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
      },
    });
    if (!quote)
      throw new NotFoundException({ code: 'QUOTE_NOT_FOUND', message: 'Quote not found' });
    const effectiveQuote = this.withEffectiveStatus(quote);
    const requestContainerType =
      effectiveQuote.items.find((item) => item.containerType)?.containerType ?? null;
    if (!effectiveQuote.sentAt) {
      return {
        ...effectiveQuote,
        subtotal: null,
        totalAmount: null,
        amountsByCurrency: null,
        customerTerms: null,
        items: [],
        requestContainerType,
      };
    }
    return { ...effectiveQuote, requestContainerType };
  }

  async accept(id: string) {
    return this.customerDecision(id, QuoteStatus.ACCEPTED);
  }
  async reject(id: string, dto: RejectQuoteDto = {}) {
    const reason = dto.reason?.trim();
    return this.customerDecision(id, QuoteStatus.REJECTED, reason ? { reason } : {});
  }

  async listInternal(query: ListQuotesDto) {
    const context = this.requireInternalContext();
    const statuses = query.statuses ?? (query.status ? [query.status] : []);
    const where: Prisma.QuoteWhereInput = { ...this.internalWhere(context), ...(query.reviewStatus ? { reviewStatus: query.reviewStatus } : {}), ...(statuses.length ? { AND: [{ OR: statuses.map((status) => status === QuoteStatus.EXPIRED
      ? { OR: [{ status }, { status: { in: [...expirableStatuses] }, validUntil: { lt: this.today() } }] }
      : { status, ...(expirableStatuses.includes(status) ? { validUntil: { gte: this.today() } } : {}) }) }] } : {}) };
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
        plannedSailingDate: true,
        reviewStatus: true,
        reviewSubmittedAt: true,
        reviewedAt: true,
        approvalNote: true,
        tenant: { select: { quoteApprovalRequired: true } },
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
        cargoItems: {
          select: {
            id: true,
            commodity: true,
            estimatedGrossWeight: true,
            cargoNature: true,
            specialRequirement: true,
            sortOrder: true,
          },
          orderBy: { sortOrder: 'asc' },
        },
        bookings: {
          select: {
            id: true,
            status: true,
            shipments: {
              select: { id: true, status: true },
              orderBy: { createdAt: 'desc' },
              take: 1,
            },
          },
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
      },
    });
    if (!quote)
      throw new NotFoundException({ code: 'QUOTE_NOT_FOUND', message: 'Quote not found' });
    const { tenant, ...detail } = quote;
    return { ...this.withEffectiveStatus(detail), approvalRequired: tenant.quoteApprovalRequired, pricing: quotePricing(quote.items) };
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
        amountsByCurrency: true,
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
        amountsByCurrency: quote.amountsByCurrency as Record<string, string>,
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
  async approvalSettings() {
    const context = this.requireInternalContext();
    return this.prisma.tenant.findUniqueOrThrow({ where: { id: context.tenantId }, select: { quoteApprovalRequired: true } });
  }
  private requireAdministrator() {
    const context = this.requireInternalContext();
    if (!context.roles.some((role) => role === RoleCode.TENANT_ADMIN || role === RoleCode.SUPER_ADMIN))
      throw new ForbiddenException({ code: 'QUOTE_ADMIN_REQUIRED', message: '只有租户管理员可以审核或设置报价发布规则。' });
    return context;
  }
  async updateApprovalSettings(quoteApprovalRequired: boolean) {
    const context = this.requireAdministrator();
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "Tenant" WHERE id = ${context.tenantId} FOR UPDATE`;
      const before = await tx.tenant.findUniqueOrThrow({ where: { id: context.tenantId }, select: { quoteApprovalRequired: true } });
      if (!quoteApprovalRequired && await tx.quote.count({ where: { tenantId: context.tenantId, status: 'DRAFT', reviewStatus: 'PENDING' } }))
        throw this.fieldError('QUOTE_REVIEWS_PENDING', '请先处理待审核报价，再关闭审核。', { quoteApprovalRequired: ['仍有报价待管理员审核。'] });
      const after = await tx.tenant.update({ where: { id: context.tenantId }, data: { quoteApprovalRequired }, select: { quoteApprovalRequired: true } });
      await tx.auditLog.create({ data: { tenantId: context.tenantId, actorUserId: context.userId, entityType: 'Tenant', entityId: context.tenantId, action: 'QUOTE_APPROVAL_SETTINGS_UPDATED', beforeData: before, afterData: after } });
      return after;
    });
  }
  async submitApproval(id: string) {
    const context = this.requireInternalContext();
    await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "Tenant" WHERE id = ${context.tenantId} FOR SHARE`;
      const tenant = await tx.tenant.findUniqueOrThrow({ where: { id: context.tenantId } });
      if (!tenant.quoteApprovalRequired) throw this.fieldError('QUOTE_APPROVAL_DISABLED', '当前租户未启用管理员审核。', {});
      await this.assertSendable(id, tx);
      const quote = await tx.quote.findFirst({ where: { id, ...this.internalWhere(context) } });
      if (!quote) throw new NotFoundException({ code: 'QUOTE_NOT_FOUND' });
      if (quote.reviewStatus === 'PENDING') throw this.fieldError('QUOTE_ALREADY_SUBMITTED', '报价已提交审核。', {});
      const updated = await tx.quote.updateMany({ where: { id, tenantId: context.tenantId, status: 'DRAFT', version: quote.version }, data: { reviewStatus: 'PENDING', reviewSubmittedAt: new Date(), reviewedAt: null, approvalNote: null, version: { increment: 1 }, updatedById: context.userId } });
      if (updated.count !== 1) throw this.fieldError('QUOTE_STATE_CONFLICT', '报价已变化，请刷新后重试。', {});
      await tx.auditLog.create({ data: { tenantId: context.tenantId, actorUserId: context.userId, entityType: 'Quote', entityId: id, action: 'REVIEW_SUBMITTED', beforeData: { reviewStatus: quote.reviewStatus }, afterData: { reviewStatus: 'PENDING', version: quote.version + 1 } } });
    });
    return this.getInternal(id);
  }
  async rejectApproval(id: string, reason: string) {
    const context = this.requireAdministrator();
    if (!reason?.trim() || reason.trim().length < 3 || reason.length > 2000) throw this.fieldError('QUOTE_REJECTION_REASON_REQUIRED', '请填写至少 3 个字符的驳回原因。', {});
    await this.prisma.$transaction(async (tx) => {
      const quote = await tx.quote.findFirst({ where: { id, tenantId: context.tenantId } });
      if (!quote) throw new NotFoundException({ code: 'QUOTE_NOT_FOUND' });
      const changed = await tx.quote.updateMany({ where: { id, tenantId: context.tenantId, status: 'DRAFT', reviewStatus: 'PENDING', version: quote.version }, data: { reviewStatus: 'REJECTED', reviewedAt: new Date(), approvalNote: reason.trim(), version: { increment: 1 }, updatedById: context.userId } });
      if (changed.count !== 1) throw this.fieldError('QUOTE_REVIEW_NOT_PENDING', '只有待管理员审核的草稿可以驳回。', {});
      await tx.auditLog.create({ data: { tenantId: context.tenantId, actorUserId: context.userId, entityType: 'Quote', entityId: id, action: 'REVIEW_REJECTED', beforeData: { reviewStatus: quote.reviewStatus }, afterData: { reviewStatus: 'REJECTED', reason: reason.trim() } } });
    });
    return this.getInternal(id);
  }
  async approveAndSend(id: string) {
    this.requireAdministrator();
    return this.transition(id, QuoteStatus.SENT, { internal: true, approval: true });
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
    const plannedSailingDate = this.parsePlannedSailingDate(dto.plannedSailingDate);
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
          plannedSailingDate: true,
          reviewStatus: true,
          version: true,
          sourceRate: { select: { expiryDate: true } },
        },
      });
      if (!quote)
        throw new NotFoundException({ code: 'QUOTE_NOT_FOUND', message: 'Quote not found' });
      if (quote.status !== QuoteStatus.DRAFT || quote.reviewStatus === 'PENDING')
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

      const data: Prisma.QuoteUpdateManyMutationInput = {
        updatedById: context.userId,
        ...(plannedSailingDate === undefined ? {} : { plannedSailingDate }),
        ...(validUntil ? { validUntil } : {}),
        ...(dto.customerTerms === undefined
          ? {}
          : { customerTerms: dto.customerTerms.trim() || null }),
        ...(dto.internalNote === undefined
          ? {}
          : { internalNote: dto.internalNote.trim() || null }),
      };
      const saved = await tx.quote.updateMany({ where: { id, ...this.internalWhere(context), status: 'DRAFT', version: quote.version, reviewStatus: { not: 'PENDING' } }, data: { ...data, version: { increment: 1 } } });
      if (saved.count !== 1) throw this.fieldError('QUOTE_STATE_CONFLICT', '报价已变化，请刷新后重试。', {});
      await tx.auditLog.create({
        data: {
          tenantId: context.tenantId,
          actorUserId: context.userId,
          entityType: 'Quote',
          entityId: id,
          action: 'REVIEW_UPDATED',
          beforeData: {
            plannedSailingDate: quote.plannedSailingDate?.toISOString().slice(0, 10) ?? null,
            validUntil: quote.validUntil.toISOString().slice(0, 10),
            customerTerms: quote.customerTerms,
            internalNote: quote.internalNote,
          },
          afterData: {
            plannedSailingDate: (plannedSailingDate === undefined ? quote.plannedSailingDate : plannedSailingDate)?.toISOString().slice(0, 10) ?? null,
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
    const plannedSailingDate = this.parsePlannedSailingDate(dto.plannedSailingDate);
    const validUntil = dto.validUntil ? this.businessDate(dto.validUntil) : undefined;
    if (dto.validUntil && !validUntil)
      throw this.fieldError('QUOTE_REVIEW_INVALID', '报价有效期不正确。', { validUntil: ['请填写有效日期。'] });
    return this.prisma.$transaction(async (tx) => {
      const quote = await tx.quote.findFirst({
        where: { id, ...this.internalWhere(context) },
        include: { items: { orderBy: { sortOrder: 'asc' } }, sourceRate: { select: { expiryDate: true } } },
      });
      if (!quote)
        throw new NotFoundException({ code: 'QUOTE_NOT_FOUND', message: 'Quote not found' });
      if (!draftQuoteStatuses.includes(quote.status as (typeof draftQuoteStatuses)[number]) || quote.reviewStatus === 'PENDING')
        throw this.fieldError(
          'QUOTE_PRICE_OVERRIDE_NOT_ALLOWED',
          '只有待销售确认的报价可以调整价格。',
          { status: ['当前报价状态不允许改价。'] },
        );
      if (validUntil && quote.sourceRate?.expiryDate && validUntil > quote.sourceRate.expiryDate)
        throw this.fieldError('QUOTE_VALID_UNTIL_EXCEEDS_RATE', '该报价有效期不能超过来源运价有效期。', {
          validUntil: ['该报价有效期不能超过来源运价有效期。'],
        });
      const invalidItems = (message: string) => this.fieldError('INVALID_QUOTE_ITEM', message, { items: [message] });
      const removed = new Set(dto.deletedItemIds ?? []);
      const existingIds = dto.items.flatMap((item) => item.itemId ? [item.itemId] : []);
      if (new Set(existingIds).size !== existingIds.length ||
          [...existingIds, ...removed].some((itemId) => !quote.items.some((item) => item.id === itemId)) ||
          existingIds.some((itemId) => removed.has(itemId)))
        throw invalidItems('费用项必须属于当前报价，且不能重复修改或同时删除。');
      if (quote.items.some((item) => removed.has(item.id) && item.chargeCode === 'OCEAN_FREIGHT'))
        throw invalidItems('海运费关联订舱箱型箱量，不能删除。');
      const decimal = (value: string, positive = false) => {
        if (typeof value !== 'string' || !/^\d{1,14}(?:\.\d{1,4})?$/.test(value))
          throw invalidItems('金额和数量最多 14 位整数、4 位小数，不能为负数。');
        const number = new Prisma.Decimal(value);
        if (positive && number.lte(0)) throw invalidItems('计费数量必须大于 0。');
        return number;
      };
      const edits = dto.items.map((input, index) => {
        const old = quote.items.find((item) => item.id === input.itemId);
        const chargeName = (input.chargeName ?? old?.chargeName ?? '').trim();
        const chargeBasis = input.chargeBasis ?? old?.chargeBasis ?? (old?.containerType ? 'PER_CONTAINER' : 'PER_SHIPMENT');
        const containerType = chargeBasis === 'PER_CONTAINER'
          ? (input.containerType ?? old?.containerType ?? '').trim() : null;
        if (!chargeName || chargeName.length > 150) throw invalidItems('请填写费用名称，最多 150 个字符。');
        if (!['PER_CONTAINER', 'PER_BL', 'PER_SHIPMENT'].includes(chargeBasis)) throw invalidItems('请选择有效的计费方式。');
        if (chargeBasis === 'PER_CONTAINER' && (!containerType || !quote.items.some((item) => item.chargeCode === 'OCEAN_FREIGHT' && item.containerType === containerType)))
          throw invalidItems('按箱计费必须选择本报价运输需求中的箱型。');
        const currency = input.currency ?? old?.currency ?? quote.currency;
        if (!/^[A-Z]{3}$/.test(currency)) throw invalidItems('费用币种必须为三位大写代码。');
        if (old?.chargeCode === 'OCEAN_FREIGHT' && currency !== old.currency) throw invalidItems('基础海运费币种沿用来源报价。');
        const quantity = decimal(input.quantity ?? old?.quantity.toString() ?? '1', true);
        if (old?.chargeCode === 'OCEAN_FREIGHT' &&
            (!quantity.eq(old.quantity) || containerType !== old.containerType || chargeBasis !== (old.chargeBasis ?? 'PER_CONTAINER')))
          throw invalidItems('海运费的箱型、箱量和计费方式须保留原运输需求。');
        const unitPrice = decimal(input.unitPrice);
        const costAmount = input.costAmount === undefined ? old?.costAmount ?? null
          : input.costAmount === null ? null : decimal(input.costAmount);
        const amount = unitPrice.mul(quantity).toDecimalPlaces(4);
        if (amount.gte('100000000000000')) throw invalidItems('费用金额超出允许范围。');
        return { old, data: {
          chargeCode: old?.chargeCode ?? 'MANUAL_CHARGE', chargeName, chargeBasis, containerType,
          quantity, unitPrice, costAmount, currency, amount,
          originalUnitPrice: old?.originalUnitPrice ?? old?.unitPrice ?? unitPrice,
          sortOrder: old?.sortOrder ?? (Math.max(-1, ...quote.items.map((item) => item.sortOrder)) + index + 1),
        } };
      });
      // Claim the draft version before mutating its lines, so concurrent send/edit cannot partially overwrite it.
      const claimed = await tx.quote.updateMany({
        where: { id, ...this.internalWhere(context), status: QuoteStatus.DRAFT, version: quote.version },
        data: { version: { increment: 1 } },
      });
      if (claimed.count !== 1) throw invalidItems('报价已被其他操作修改，请刷新后重试。');
      const snapshot = (item: { id: string; chargeCode: string; chargeName: string; chargeBasis: string | null; containerType: string | null; currency: string; quantity: Prisma.Decimal; unitPrice: Prisma.Decimal; amount: Prisma.Decimal; costAmount: Prisma.Decimal | null }) => ({
        id: item.id, chargeCode: item.chargeCode, chargeName: item.chargeName, chargeBasis: item.chargeBasis,
        containerType: item.containerType, currency: item.currency, quantity: item.quantity.toString(),
        unitPrice: item.unitPrice.toString(), amount: item.amount.toString(), costAmount: item.costAmount?.toString() ?? null,
      });
      const beforeItems = quote.items.map(snapshot);
      await tx.quoteItem.deleteMany({ where: { tenantId: context.tenantId, quoteId: id, id: { in: [...removed] } } });
      for (const edit of edits) {
        if (edit.old) await tx.quoteItem.update({ where: { id: edit.old.id, tenantId: context.tenantId, quoteId: id }, data: edit.data });
        else await tx.quoteItem.create({ data: { ...edit.data, tenantId: context.tenantId, quoteId: id } });
      }
      const savedItems = await tx.quoteItem.findMany({ where: { tenantId: context.tenantId, quoteId: id }, orderBy: { sortOrder: 'asc' } });
      if (!savedItems.length || savedItems.length > 100) throw invalidItems('报价必须包含 1 至 100 条费用。');
      const totals = new Map<string, Prisma.Decimal>();
      for (const item of savedItems) totals.set(item.currency, (totals.get(item.currency) ?? new Prisma.Decimal(0)).plus(item.amount));
      if ([...totals.values()].some((amount) => amount.gte('100000000000000'))) throw invalidItems('报价总额超出允许范围。');
      const amountsByCurrency = Object.fromEntries([...totals].map(([currency, amount]) => [currency, amount.toString()]));
      const total = totals.get(quote.currency) ?? new Prisma.Decimal(0);
      const updated = await tx.quote.update({
        where: { id },
        data: {
          subtotal: total,
          totalAmount: total,
          amountsByCurrency,
          priceOverriddenAt: new Date(),
          priceOverriddenById: context.userId,
          priceOverrideReason: dto.reason.trim(),
          ...(plannedSailingDate === undefined ? {} : { plannedSailingDate }),
          ...(validUntil ? { validUntil } : {}),
          ...(dto.internalNote === undefined ? {} : { internalNote: dto.internalNote.trim() || null }),
          ...(dto.customerTerms === undefined ? {} : { customerTerms: dto.customerTerms.trim() }),
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
          beforeData: { totalAmount: quote.totalAmount.toString(), items: beforeItems, customerTerms: quote.customerTerms, validUntil: quote.validUntil.toISOString().slice(0, 10), internalNote: quote.internalNote, plannedSailingDate: quote.plannedSailingDate?.toISOString().slice(0, 10) ?? null },
          afterData: {
            plannedSailingDate: (plannedSailingDate === undefined ? quote.plannedSailingDate : plannedSailingDate)?.toISOString().slice(0, 10) ?? null,
            totalAmount: total.toString(),
            amountsByCurrency,
            reason: dto.reason.trim(),
            validUntil: (validUntil ?? quote.validUntil).toISOString().slice(0, 10),
            internalNote: dto.internalNote === undefined ? quote.internalNote : dto.internalNote.trim() || null,
            customerTerms: dto.customerTerms === undefined ? quote.customerTerms : dto.customerTerms.trim(),
            items: savedItems.map(snapshot),
            deletedItemIds: [...removed],
            addedItemIds: savedItems.filter((item) => !quote.items.some((old) => old.id === item.id)).map((item) => item.id),
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
      approval?: boolean;
    },
  ) {
    const context = this.requestContext.requireAuthenticated();
    const emailJobs: EmailNotificationJobData[] = [];
    const result = await this.prisma.$transaction(async (tx) => {
      const where = options.internal
        ? { id, ...this.internalWhere(context) }
        : { id, tenantId: context.tenantId, customerCompanyId: options.customerCompanyId };
      const quote = await tx.quote.findFirst({
        where,
        select: { id: true, status: true, quoteNo: true, validUntil: true, version: true, customerCompanyId: true, reviewStatus: true },
      });
      if (!quote)
        throw new NotFoundException({ code: 'QUOTE_NOT_FOUND', message: 'Quote not found' });
      if (quote.status === target && options.idempotent)
        return tx.quote.findUniqueOrThrow({ where: { id }, select: publicQuoteSelect });
      if (target === QuoteStatus.SENT) {
        await tx.$queryRaw`SELECT id FROM "Tenant" WHERE id = ${context.tenantId} FOR SHARE`;
        const tenant = await tx.tenant.findUniqueOrThrow({ where: { id: context.tenantId } });
        if (options.approval) {
          this.requireAdministrator();
          if (quote.reviewStatus !== 'PENDING') throw this.fieldError('QUOTE_REVIEW_NOT_PENDING', '请先提交管理员审核。', {});
        } else if (tenant.quoteApprovalRequired || quote.reviewStatus === 'PENDING') {
          throw this.fieldError('QUOTE_APPROVAL_REQUIRED', '请先提交管理员审核，由管理员审核并发布。', {});
        }
        await this.assertSendable(id, tx);
      }
      if (!this.stateMachine.canTransition(quote.status, target))
        throw new BadRequestException({
          code: 'ILLEGAL_QUOTE_TRANSITION',
          message: `Quote cannot transition from ${quote.status} to ${target}`,
          details: { from: quote.status, to: target },
        });
      const updated = await tx.quote.updateMany({
        where: { id, tenantId: context.tenantId, status: quote.status, version: quote.version },
        data: {
          status: target,
          ...(options.approval ? { reviewStatus: 'APPROVED' as const, reviewedAt: new Date() } : {}),
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
          afterData: { status: target, ...(options.approval ? { reviewStatus: 'APPROVED', approvedVersion: quote.version } : {}), ...(options.auditData ?? {}) },
        },
      });
      if (target === QuoteStatus.SENT && this.notificationEvents) emailJobs.push(...await this.notificationEvents.createCustomerNotifications(tx, {
        tenantId: context.tenantId, customerCompanyId: quote.customerCompanyId, type: 'QUOTE_SENT',
        payload: { title: `正式报价 ${quote.quoteNo} 已发布`, description: '请查看报价详情并确认。', href: `/portal/quotes/${id}`, quoteId: id },
      }));
      return tx.quote.findUniqueOrThrow({ where: { id }, select: publicQuoteSelect });
    });
    await this.notificationEvents?.enqueueEmailNotifications(emailJobs);
    return result;
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

  private toCustomerQuoteSummary<
    T extends {
      status: QuoteStatus;
      subtotal: Prisma.Decimal;
      totalAmount: Prisma.Decimal;
      customerTerms: string | null;
      sentAt: Date | null;
    },
  >(quote: T) {
    return !quote.sentAt
      ? { ...quote, subtotal: null, totalAmount: null, amountsByCurrency: null, customerTerms: null }
      : quote;
  }

  private async assertSendable(id: string, db: Prisma.TransactionClient = this.prisma) {
    const context = this.requireInternalContext();
    const quote = await db.quote.findFirst({
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
    if (context.roles.includes(RoleCode.SALES) && !context.roles.some((role) => role === RoleCode.TENANT_ADMIN || role === RoleCode.SUPER_ADMIN)) {
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
  private parsePlannedSailingDate(value: string | null | undefined) {
    if (value === undefined || value === null) return value;
    const date = typeof value === 'string' && /^(?!0000)\d{4}-\d{2}-\d{2}$/.test(value)
      ? new Date(`${value}T00:00:00.000Z`) : null;
    if (!date || Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value)
      throw this.fieldError('QUOTE_REVIEW_INVALID', '拟参加船期不正确。', {
        plannedSailingDate: ['请选择有效的拟参加船期。'],
      });
    return date;
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
