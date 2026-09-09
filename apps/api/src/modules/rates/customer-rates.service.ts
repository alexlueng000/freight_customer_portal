import { BadRequestException, ForbiddenException, Injectable } from '@nestjs/common';
import { CustomerStatus, Prisma, RateStatus } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service.js';
import { RequestContextService } from '../../shared/request-context/request-context.service.js';
import type { SearchCustomerRatesDto } from './dto/search-customer-rates.dto.js';
import { CustomerRatePricingService } from './customer-rate-pricing.service.js';
import { portDisplayName, portSearchFilter } from './port-search.js';

@Injectable()
export class CustomerRatesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly requestContext: RequestContextService,
    private readonly pricing: CustomerRatePricingService,
  ) {}

  async search(query: SearchCustomerRatesDto) {
    const context = this.requestContext.requireAuthenticated();
    if (!context.customerCompanyId) {
      throw new BadRequestException({
        code: 'CUSTOMER_RATE_SCOPE_REQUIRED',
        message: 'Customer rate search requires a customer account',
      });
    }
    if ((query.etdFrom && !query.etdTo) || (!query.etdFrom && query.etdTo)) {
      throw new BadRequestException({
        code: 'INCOMPLETE_DEPARTURE_RANGE',
        message: 'etdFrom and etdTo must be provided together',
      });
    }
    if (query.etdFrom && query.etdTo && query.etdFrom > query.etdTo) {
      throw new BadRequestException({
        code: 'INVALID_DEPARTURE_RANGE',
        message: 'etdFrom must not be after etdTo',
      });
    }
    const customer = await this.prisma.customerCompany.findFirst({
      where: { id: context.customerCompanyId, tenantId: context.tenantId },
      select: { id: true, status: true, defaultMarkupType: true, defaultMarkupValue: true },
    });
    if (!customer || customer.status !== CustomerStatus.ACTIVE) {
      throw new ForbiddenException({
        code: 'CUSTOMER_COMPANY_INACTIVE',
        message: 'Customer company is not active',
      });
    }
    const today = this.businessDate(new Date().toISOString().slice(0, 10));
    const from = query.etdFrom ? this.businessDate(query.etdFrom) : today;
    const to = query.etdTo ? this.businessDate(query.etdTo) : undefined;
    const rateWhere: Prisma.RateWhereInput = {
      tenantId: context.tenantId,
      status: RateStatus.ACTIVE,
      ...(query.polCode ? { polCode: query.polCode } : {}),
      ...(query.podCode ? { podCode: query.podCode } : {}),
      AND: [portSearchFilter('pol', query.pol), portSearchFilter('pod', query.pod)],
      ...(query.carrierCode ? { carrierCode: query.carrierCode } : {}),
      effectiveDate: { lte: to ?? today },
      expiryDate: { gte: from },
      OR: [{ etd: null }, { etd: { gte: from, ...(to ? { lte: this.endOfDay(to) } : {}) } }],
    };
    const where: Prisma.RatePriceWhereInput = {
      tenantId: context.tenantId,
      ...(query.containerType ? { containerType: query.containerType } : {}),
      rate: { is: rateWhere },
    };
    const [prices, total] = await this.prisma.$transaction([
      this.prisma.ratePrice.findMany({
        where,
        select: {
          id: true,
          containerType: true,
          costAmount: true,
          sellAmount: true,
          currency: true,
          rate: {
            select: {
              id: true,
              polCode: true,
              polName: true,
              podCode: true,
              podName: true,
              carrierCode: true,
              serviceName: true,
              effectiveDate: true,
              expiryDate: true,
              etd: true,
              transitDays: true,
              charges: {
                where: { isIncluded: false },
                select: {
                  id: true,
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
          },
        },
        orderBy: [{ rate: { etd: 'asc' } }, { rate: { expiryDate: 'asc' } }, { id: 'asc' }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.ratePrice.count({ where }),
    ]);
    return {
      items: prices.map((price) => {
        const rate = price.rate;
        const oceanSellAmount = this.pricing.calculate(
          price.costAmount,
          price.sellAmount,
          customer.defaultMarkupType,
          customer.defaultMarkupValue,
        );
        const charges = rate.charges
          .filter(
            (charge) =>
              charge.currency === price.currency &&
              (charge.chargeBasis !== 'PER_CONTAINER' ||
                charge.containerType === price.containerType),
          )
          .map((charge) => ({ ...charge, amount: charge.amount.toString() }));
        const totalSellAmount = charges.reduce(
          (total, charge) => total.plus(charge.amount),
          oceanSellAmount,
        );
        return {
          id: rate.id,
          polCode: rate.polCode,
          polName: rate.polName,
          polDisplayName: portDisplayName(rate.polCode, rate.polName),
          podCode: rate.podCode,
          podName: rate.podName,
          podDisplayName: portDisplayName(rate.podCode, rate.podName),
          carrierCode: rate.carrierCode,
          serviceName: rate.serviceName,
          effectiveDate: rate.effectiveDate,
          expiryDate: rate.expiryDate,
          etd: rate.etd,
          transitDays: rate.transitDays,
          containerType: price.containerType,
          oceanSellAmount: oceanSellAmount.toString(),
          sellAmount: totalSellAmount.toString(),
          charges,
          currency: price.currency,
        };
      }),
      pagination: {
        page: query.page,
        pageSize: query.pageSize,
        total,
        totalPages: Math.ceil(total / query.pageSize),
      },
    };
  }

  private businessDate(value: string): Date {
    return new Date(`${value}T00:00:00.000Z`);
  }
  private endOfDay(value: Date): Date {
    return new Date(value.getTime() + 86_399_999);
  }
}
