import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { MarkupType, Prisma, QuoteStatus, RoleCode, UserType } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service.js';
import { RequestContextService } from '../../shared/request-context/request-context.service.js';
import type { CreateCustomerDto } from './dto/create-customer.dto.js';
import type { CreateCustomerContactDto } from './dto/create-customer-contact.dto.js';
import type { ListCustomersDto } from './dto/list-customers.dto.js';
import type { UpdateCustomerDto } from './dto/update-customer.dto.js';

const customerSelect = {
  id: true,
  code: true,
  name: true,
  shortName: true,
  countryCode: true,
  taxId: true,
  creditLimit: true,
  paymentTermDays: true,
  defaultMarkupType: true,
  defaultMarkupValue: true,
  salesOwnerId: true,
  status: true,
  createdAt: true,
  updatedAt: true,
  salesOwner: { select: { id: true, displayName: true, email: true } },
  _count: { select: { contacts: true, customerUsers: true } },
} satisfies Prisma.CustomerCompanySelect;

const contactSelect = {
  id: true,
  customerCompanyId: true,
  name: true,
  email: true,
  phone: true,
  roleTitle: true,
  isPrimary: true,
  isBookingContact: true,
  isDocumentContact: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.CustomerContactSelect;

@Injectable()
export class CustomersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly requestContext: RequestContextService,
  ) {}

  async list(query: ListCustomersDto) {
    const context = this.requestContext.requireAuthenticated();
    const where: Prisma.CustomerCompanyWhereInput = {
      tenantId: context.tenantId,
      ...(context.customerCompanyId ? { id: context.customerCompanyId } : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(query.search
        ? {
            OR: [
              { code: { contains: query.search, mode: 'insensitive' } },
              { name: { contains: query.search, mode: 'insensitive' } },
              { shortName: { contains: query.search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };
    const skip = (query.page - 1) * query.pageSize;
    const [items, total] = await this.prisma.$transaction([
      this.prisma.customerCompany.findMany({
        where,
        select: customerSelect,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip,
        take: query.pageSize,
      }),
      this.prisma.customerCompany.count({ where }),
    ]);

    return {
      items,
      pagination: {
        page: query.page,
        pageSize: query.pageSize,
        total,
        totalPages: Math.ceil(total / query.pageSize),
      },
    };
  }

  async getById(id: string) {
    const context = this.requestContext.requireAuthenticated();
    const customer = await this.prisma.customerCompany.findFirst({
      where: {
        tenantId: context.tenantId,
        AND: [{ id }, ...(context.customerCompanyId ? [{ id: context.customerCompanyId }] : [])],
      },
      select: customerSelect,
    });
    if (!customer) {
      throw new NotFoundException({ code: 'CUSTOMER_NOT_FOUND', message: 'Customer not found' });
    }
    return customer;
  }

  async create(dto: CreateCustomerDto) {
    const context = this.requestContext.requireAuthenticated();
    if (context.customerCompanyId) {
      throw new BadRequestException({
        code: 'CUSTOMER_SCOPE_RESTRICTED',
        message: 'Customer users cannot create customer companies',
      });
    }
    this.validateMarkup(dto);
    await this.validateSalesOwner(dto.salesOwnerId, context.tenantId);

    const data = {
      tenantId: context.tenantId,
      code: dto.code,
      name: dto.name,
      shortName: this.optionalText(dto.shortName),
      countryCode: dto.countryCode,
      taxId: this.optionalText(dto.taxId),
      creditLimit: dto.creditLimit ? new Prisma.Decimal(dto.creditLimit) : undefined,
      paymentTermDays: dto.paymentTermDays,
      defaultMarkupType: dto.defaultMarkupType,
      defaultMarkupValue: dto.defaultMarkupValue
        ? new Prisma.Decimal(dto.defaultMarkupValue)
        : undefined,
      salesOwnerId: dto.salesOwnerId,
      status: dto.status,
      createdById: context.userId,
      updatedById: context.userId,
    } satisfies Prisma.CustomerCompanyUncheckedCreateInput;

    try {
      return await this.prisma.$transaction(async (transaction) => {
        const customer = await transaction.customerCompany.create({ data, select: customerSelect });
        await transaction.auditLog.create({
          data: {
            tenantId: context.tenantId,
            actorUserId: context.userId,
            entityType: 'CustomerCompany',
            entityId: customer.id,
            action: 'CUSTOMER_CREATED',
            afterData: this.auditData(customer),
          },
        });
        return customer;
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException({
          code: 'CUSTOMER_CODE_EXISTS',
          message: 'Customer code already exists in this tenant',
        });
      }
      throw error;
    }
  }

  async update(id: string, dto: UpdateCustomerDto) {
    const context = this.requestContext.requireAuthenticated();
    const existing = await this.prisma.customerCompany.findFirst({
      where: { id, tenantId: context.tenantId },
      select: customerSelect,
    });
    if (!existing)
      throw new NotFoundException({ code: 'CUSTOMER_NOT_FOUND', message: 'Customer not found' });
    const effectiveMarkupType = dto.defaultMarkupType ?? existing.defaultMarkupType;
    const effectiveMarkupValue =
      dto.defaultMarkupType === MarkupType.NONE
        ? undefined
        : dto.defaultMarkupValue === undefined
          ? existing.defaultMarkupValue?.toString()
          : (dto.defaultMarkupValue ?? undefined);
    this.validateMarkup({
      defaultMarkupType: effectiveMarkupType,
      defaultMarkupValue: effectiveMarkupValue,
    });
    await this.validateSalesOwner(dto.salesOwnerId ?? undefined, context.tenantId);
    const data: Prisma.CustomerCompanyUpdateInput = {
      ...(dto.name !== undefined ? { name: dto.name } : {}),
      ...(dto.shortName !== undefined
        ? { shortName: this.optionalText(dto.shortName) ?? null }
        : {}),
      ...(dto.countryCode !== undefined ? { countryCode: dto.countryCode } : {}),
      ...(dto.taxId !== undefined ? { taxId: this.optionalText(dto.taxId) ?? null } : {}),
      ...(dto.creditLimit !== undefined
        ? { creditLimit: dto.creditLimit === null ? null : new Prisma.Decimal(dto.creditLimit) }
        : {}),
      ...(dto.paymentTermDays !== undefined ? { paymentTermDays: dto.paymentTermDays } : {}),
      ...(dto.defaultMarkupType !== undefined ? { defaultMarkupType: dto.defaultMarkupType } : {}),
      ...(dto.defaultMarkupValue !== undefined
        ? {
            defaultMarkupValue:
              dto.defaultMarkupValue === null ? null : new Prisma.Decimal(dto.defaultMarkupValue),
          }
        : {}),
      ...(dto.defaultMarkupType === MarkupType.NONE ? { defaultMarkupValue: null } : {}),
      ...(dto.salesOwnerId !== undefined
        ? {
            salesOwner:
              dto.salesOwnerId === null
                ? { disconnect: true }
                : { connect: { id: dto.salesOwnerId } },
          }
        : {}),
      ...(dto.status !== undefined ? { status: dto.status } : {}),
      updatedById: context.userId,
    };
    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.customerCompany.update({
        where: { id },
        data,
        select: customerSelect,
      });
      if (dto.salesOwnerId && dto.salesOwnerId !== existing.salesOwnerId) {
        await tx.quote.updateMany({
          where: {
            tenantId: context.tenantId,
            customerCompanyId: id,
            salesOwnerId: null,
            status: QuoteStatus.DRAFT,
          },
          data: {
            salesOwnerId: dto.salesOwnerId,
            updatedById: context.userId,
          },
        });
      }
      await tx.auditLog.create({
        data: {
          tenantId: context.tenantId,
          actorUserId: context.userId,
          entityType: 'CustomerCompany',
          entityId: id,
          action: 'CUSTOMER_UPDATED',
          beforeData: this.auditData(existing),
          afterData: this.auditData(updated),
        },
      });
      return updated;
    });
  }

  async listContacts(customerId: string) {
    const context = this.requestContext.requireAuthenticated();
    await this.requireCustomerInScope(customerId, context.tenantId, context.customerCompanyId);

    return this.prisma.customerContact.findMany({
      where: { tenantId: context.tenantId, customerCompanyId: customerId },
      select: contactSelect,
      orderBy: [{ isPrimary: 'desc' }, { createdAt: 'asc' }, { id: 'asc' }],
    });
  }

  async createContact(customerId: string, dto: CreateCustomerContactDto) {
    const context = this.requestContext.requireAuthenticated();
    await this.requireCustomerInScope(customerId, context.tenantId, context.customerCompanyId);

    return this.prisma.$transaction(async (transaction) => {
      const contact = await transaction.customerContact.create({
        data: {
          tenantId: context.tenantId,
          customerCompanyId: customerId,
          name: dto.name,
          email: dto.email?.toLowerCase(),
          phone: dto.phone,
          roleTitle: dto.roleTitle,
          isPrimary: dto.isPrimary,
          isBookingContact: dto.isBookingContact,
          isDocumentContact: dto.isDocumentContact,
          createdById: context.userId,
          updatedById: context.userId,
        },
        select: contactSelect,
      });
      await transaction.auditLog.create({
        data: {
          tenantId: context.tenantId,
          actorUserId: context.userId,
          entityType: 'CustomerContact',
          entityId: contact.id,
          action: 'CUSTOMER_CONTACT_CREATED',
          afterData: {
            customerCompanyId: customerId,
            name: contact.name,
            roleTitle: contact.roleTitle,
            hasEmail: Boolean(contact.email),
            hasPhone: Boolean(contact.phone),
            isPrimary: contact.isPrimary,
            isBookingContact: contact.isBookingContact,
            isDocumentContact: contact.isDocumentContact,
          },
        },
      });
      return contact;
    });
  }

  private validateMarkup(
    dto: Pick<CreateCustomerDto, 'defaultMarkupType' | 'defaultMarkupValue'>,
  ): void {
    if (dto.defaultMarkupType === MarkupType.NONE && dto.defaultMarkupValue !== undefined) {
      throw new BadRequestException({
        code: 'INVALID_MARKUP',
        message: 'Markup value must be omitted when markup type is NONE',
      });
    }
    if (dto.defaultMarkupType !== MarkupType.NONE && dto.defaultMarkupValue === undefined) {
      throw new BadRequestException({
        code: 'INVALID_MARKUP',
        message: 'Markup value is required for FIXED or PERCENT markup',
      });
    }
  }

  private async requireCustomerInScope(
    customerId: string,
    tenantId: string,
    scopedCustomerId: string | undefined,
  ): Promise<void> {
    const customer = await this.prisma.customerCompany.findFirst({
      where: {
        tenantId,
        AND: [{ id: customerId }, ...(scopedCustomerId ? [{ id: scopedCustomerId }] : [])],
      },
      select: { id: true },
    });
    if (!customer) {
      throw new NotFoundException({ code: 'CUSTOMER_NOT_FOUND', message: 'Customer not found' });
    }
  }

  private async validateSalesOwner(
    salesOwnerId: string | undefined,
    tenantId: string,
  ): Promise<void> {
    if (!salesOwnerId) return;
    const owner = await this.prisma.user.findFirst({
      where: {
        id: salesOwnerId,
        tenantId,
        userType: UserType.INTERNAL,
        userRoles: { some: { role: { code: RoleCode.SALES } } },
      },
      select: { id: true },
    });
    if (!owner) {
      throw new BadRequestException({
        code: 'INVALID_SALES_OWNER',
        message: 'Sales owner must be a sales user in the current tenant',
      });
    }
  }

  private optionalText(value: string | null | undefined): string | undefined {
    const normalized = value?.trim();
    return normalized || undefined;
  }

  private auditData(
    customer: Awaited<ReturnType<CustomersService['getById']>>,
  ): Prisma.InputJsonValue {
    return {
      code: customer.code,
      name: customer.name,
      shortName: customer.shortName,
      countryCode: customer.countryCode,
      taxId: customer.taxId,
      creditLimit: customer.creditLimit?.toString() ?? null,
      paymentTermDays: customer.paymentTermDays,
      defaultMarkupType: customer.defaultMarkupType,
      defaultMarkupValue: customer.defaultMarkupValue?.toString() ?? null,
      salesOwnerId: customer.salesOwnerId,
      status: customer.status,
    };
  }
}
