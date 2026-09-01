import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  BookingReviewActionType,
  BookingStatus,
  Prisma,
  QuoteStatus,
  RoleCode,
} from '@prisma/client';
import { PrismaService } from '../../database/prisma.service.js';
import { RequestContextService } from '../../shared/request-context/request-context.service.js';
import { BookingStateMachine } from './booking-state-machine.js';
import type { BookingActionDto } from './dto/booking-action.dto.js';
import type { CreateShipmentDto } from './dto/create-shipment.dto.js';
import type { CreateBookingDto } from './dto/create-booking.dto.js';
import type { ListBookingsDto } from './dto/list-bookings.dto.js';
import type { UpdateBookingDto } from './dto/update-booking.dto.js';
import type { CreateCustomerShipperDto } from './dto/create-customer-shipper.dto.js';
import type { UpdateCustomerShipperDto } from './dto/update-customer-shipper.dto.js';
import type { RequestBookingRevisionDto } from './dto/request-booking-revision.dto.js';
import type { SubmitBookingToCarrierDto } from './dto/submit-booking-to-carrier.dto.js';

const bookingSelect = {
  id: true,
  bookingNo: true,
  quoteId: true,
  status: true,
  polCode: true,
  podCode: true,
  carrierCode: true,
  etd: true,
  commodity: true,
  packageType: true,
  packages: true,
  grossWeight: true,
  volumeCbm: true,
  cargoReadyDate: true,
  isDangerousGoods: true,
  specialInstructions: true,
  sourceShipperId: true,
  shipperName: true,
  shipperAddress: true,
  bookingContactName: true,
  bookingContactEmail: true,
  bookingContactPhone: true,
  lastStatusRemark: true,
  submittedAt: true,
  underReviewAt: true,
  confirmedAt: true,
  rejectedAt: true,
  cancelledAt: true,
  createdAt: true,
  updatedAt: true,
  containerRequests: {
    select: {
      id: true,
      containerType: true,
      quantity: true,
      weightPerContainer: true,
      remark: true,
      sortOrder: true,
    },
    orderBy: { sortOrder: 'asc' as const },
  },
  quote: { select: { quoteNo: true, currency: true, totalAmount: true } },
  shipments: {
    select: {
      id: true,
      shipmentNo: true,
      status: true,
      vessel: true,
      voyage: true,
    },
    orderBy: { createdAt: 'desc' as const },
  },
} satisfies Prisma.BookingSelect;

const shipmentSelect = {
  id: true,
  shipmentNo: true,
  bookingId: true,
  status: true,
  carrierCode: true,
  vessel: true,
  voyage: true,
  polCode: true,
  podCode: true,
  etd: true,
  eta: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.ShipmentSelect;

const customerShipperSelect = {
  id: true,
  name: true,
  address: true,
  contactName: true,
  contactEmail: true,
  contactPhone: true,
  isDefault: true,
  status: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.CustomerShipperSelect;

@Injectable()
export class BookingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly requestContext: RequestContextService,
    private readonly stateMachine: BookingStateMachine,
  ) {}

  async create(dto: CreateBookingDto) {
    const context = this.requireCustomer();
    return this.prisma.$transaction(async (tx) => {
      const quote = await tx.quote.findFirst({
        where: {
          id: dto.quoteId,
          tenantId: context.tenantId,
          customerCompanyId: context.customerCompanyId,
          status: QuoteStatus.ACCEPTED,
        },
        include: {
          items: {
            where: { chargeCode: 'OCEAN_FREIGHT', containerType: { not: null } },
            orderBy: { sortOrder: 'asc' },
          },
        },
      });
      if (!quote)
        throw new BadRequestException({
          code: 'QUOTE_NOT_BOOKABLE',
          message: 'Only an accepted quote in the current customer scope can create a booking',
        });
      const existing = await tx.booking.findFirst({
        where: { tenantId: context.tenantId, quoteId: quote.id },
        select: { id: true },
      });
      if (existing)
        throw new BadRequestException({
          code: 'QUOTE_ALREADY_BOOKED',
          message: 'This quote already has a booking',
        });
      const now = new Date();
      const yearMonth = `${now.getUTCFullYear()}${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
      const counter = await tx.businessNumberCounter.upsert({
        where: {
          tenantId_type_yearMonth: { tenantId: context.tenantId, type: 'BOOKING', yearMonth },
        },
        create: { tenantId: context.tenantId, type: 'BOOKING', yearMonth, value: 1 },
        update: { value: { increment: 1 } },
        select: { value: true },
      });
      const bookingNo = `BOOK${yearMonth}${String(counter.value).padStart(6, '0')}`;
      const grouped = new Map<string, number>();
      for (const item of quote.items)
        if (item.containerType)
          grouped.set(
            item.containerType,
            Math.max(1, Math.round(Number(item.quantity))) + (grouped.get(item.containerType) ?? 0),
          );
      const user = await tx.user.findFirstOrThrow({
        where: { id: context.userId, tenantId: context.tenantId },
        select: { displayName: true, email: true },
      });
      const matchedContact = await tx.customerContact.findFirst({
        where: {
          tenantId: context.tenantId,
          customerCompanyId: context.customerCompanyId,
          email: { equals: user.email, mode: 'insensitive' },
        },
      });
      const defaultContact = await tx.customerContact.findFirst({
        where: {
          tenantId: context.tenantId,
          customerCompanyId: context.customerCompanyId,
          isBookingContact: true,
        },
        orderBy: [{ isPrimary: 'desc' }, { createdAt: 'asc' }],
      });
      const defaultShipper = await tx.customerShipper.findFirst({
        where: {
          tenantId: context.tenantId,
          customerCompanyId: context.customerCompanyId,
          isDefault: true,
          status: 'ACTIVE',
        },
      });
      const booking = await tx.booking.create({
        data: {
          tenantId: context.tenantId,
          bookingNo,
          quoteId: quote.id,
          customerCompanyId: context.customerCompanyId!,
          polCode: quote.polCode,
          podCode: quote.podCode,
          carrierCode: quote.carrierCode,
          etd: quote.etd,
          bookingContactName: user.displayName,
          bookingContactEmail: user.email,
          bookingContactPhone: matchedContact?.phone ?? defaultContact?.phone,
          sourceShipperId: defaultShipper?.id,
          shipperName: defaultShipper?.name,
          shipperAddress: defaultShipper?.address,
          createdById: context.userId,
          updatedById: context.userId,
          containerRequests: {
            create: [...grouped].map(([containerType, quantity], sortOrder) => ({
              tenantId: context.tenantId,
              containerType,
              quantity,
              sortOrder,
            })),
          },
        },
        select: bookingSelect,
      });
      const changed = await tx.quote.updateMany({
        where: { id: quote.id, tenantId: context.tenantId, status: QuoteStatus.ACCEPTED },
        data: { status: QuoteStatus.BOOKED, bookedAt: now, updatedById: context.userId },
      });
      if (changed.count !== 1)
        throw new BadRequestException({
          code: 'QUOTE_STATE_CONFLICT',
          message: 'Quote status changed; refresh and try again',
        });
      await tx.auditLog.createMany({
        data: [
          {
            tenantId: context.tenantId,
            actorUserId: context.userId,
            entityType: 'Booking',
            entityId: booking.id,
            action: 'CREATE',
            afterData: { bookingNo, quoteId: quote.id, status: BookingStatus.DRAFT },
          },
          {
            tenantId: context.tenantId,
            actorUserId: context.userId,
            entityType: 'Quote',
            entityId: quote.id,
            action: 'STATUS_BOOKED',
            beforeData: { status: QuoteStatus.ACCEPTED },
            afterData: { status: QuoteStatus.BOOKED, bookingId: booking.id },
          },
        ],
      });
      return booking;
    });
  }

  async list(query: ListBookingsDto) {
    return this.listScoped(query, false);
  }
  async listInternal(query: ListBookingsDto) {
    return this.listScoped(query, true);
  }
  async get(id: string) {
    return this.getScoped(id, false);
  }
  async getInternal(id: string) {
    return this.getScoped(id, true);
  }

  async listCustomerShippers() {
    const context = this.requireCustomer();
    return this.prisma.customerShipper.findMany({
      where: {
        tenantId: context.tenantId,
        customerCompanyId: context.customerCompanyId,
        status: 'ACTIVE',
      },
      select: customerShipperSelect,
      orderBy: [{ isDefault: 'desc' }, { name: 'asc' }, { id: 'asc' }],
    });
  }

  async createCustomerShipper(dto: CreateCustomerShipperDto) {
    const context = this.requireCustomer();
    try {
      return await this.prisma.$transaction(async (tx) => {
        if (dto.isDefault) {
          await tx.customerShipper.updateMany({
            where: { tenantId: context.tenantId, customerCompanyId: context.customerCompanyId },
            data: { isDefault: false, updatedById: context.userId },
          });
        }
        const shipper = await tx.customerShipper.create({
          data: {
            tenantId: context.tenantId,
            customerCompanyId: context.customerCompanyId!,
            name: dto.name.trim(),
            address: dto.address.trim(),
            contactName: dto.contactName?.trim() || null,
            contactEmail: dto.contactEmail?.trim().toLowerCase() || null,
            contactPhone: dto.contactPhone?.trim() || null,
            isDefault: dto.isDefault ?? false,
            status: dto.status ?? 'ACTIVE',
            createdById: context.userId,
            updatedById: context.userId,
          },
          select: customerShipperSelect,
        });
        await tx.auditLog.create({
          data: {
            tenantId: context.tenantId,
            actorUserId: context.userId,
            entityType: 'CustomerShipper',
            entityId: shipper.id,
            action: 'CREATE',
            afterData: {
              customerCompanyId: context.customerCompanyId,
              name: shipper.name,
              isDefault: shipper.isDefault,
              status: shipper.status,
              hasContactEmail: Boolean(shipper.contactEmail),
              hasContactPhone: Boolean(shipper.contactPhone),
            },
          },
        });
        return shipper;
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException({
          code: 'DEFAULT_SHIPPER_CONFLICT',
          message: 'The customer already has a default shipper; refresh and try again',
        });
      }
      throw error;
    }
  }

  async updateCustomerShipper(id: string, dto: UpdateCustomerShipperDto) {
    const context = this.requireCustomer();
    if (dto.status === 'INACTIVE' && dto.isDefault === true)
      throw new BadRequestException({
        code: 'INACTIVE_DEFAULT_SHIPPER_INVALID',
        message: 'An inactive shipper cannot be the default',
      });
    try {
      return await this.prisma.$transaction(async (tx) => {
        const existing = await tx.customerShipper.findFirst({
          where: {
            id,
            tenantId: context.tenantId,
            customerCompanyId: context.customerCompanyId,
          },
          select: customerShipperSelect,
        });
        if (!existing)
          throw new NotFoundException({
            code: 'CUSTOMER_SHIPPER_NOT_FOUND',
            message: 'Customer shipper not found',
          });
        if (dto.isDefault === true) {
          await tx.customerShipper.updateMany({
            where: {
              tenantId: context.tenantId,
              customerCompanyId: context.customerCompanyId,
              id: { not: id },
            },
            data: { isDefault: false, updatedById: context.userId },
          });
        }
        const status = dto.status ?? existing.status;
        const shipper = await tx.customerShipper.update({
          where: { id },
          data: {
            name: dto.name?.trim(),
            address: dto.address?.trim(),
            contactName: dto.contactName?.trim() || undefined,
            contactEmail: dto.contactEmail?.trim().toLowerCase() || undefined,
            contactPhone: dto.contactPhone?.trim() || undefined,
            status,
            isDefault: status === 'INACTIVE' ? false : dto.isDefault,
            updatedById: context.userId,
          },
          select: customerShipperSelect,
        });
        await tx.auditLog.create({
          data: {
            tenantId: context.tenantId,
            actorUserId: context.userId,
            entityType: 'CustomerShipper',
            entityId: id,
            action: 'UPDATE',
            beforeData: this.shipperAuditSnapshot(existing),
            afterData: this.shipperAuditSnapshot(shipper),
          },
        });
        return shipper;
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException({
          code: 'DEFAULT_SHIPPER_CONFLICT',
          message: 'The customer already has a default shipper; refresh and try again',
        });
      }
      throw error;
    }
  }

  async update(id: string, dto: UpdateBookingDto) {
    const context = this.requireCustomer();
    return this.prisma.$transaction(async (tx) => {
      const booking = await tx.booking.findFirst({
        where: { id, tenantId: context.tenantId, customerCompanyId: context.customerCompanyId },
        include: { containerRequests: true },
      });
      if (!booking)
        throw new NotFoundException({ code: 'BOOKING_NOT_FOUND', message: 'Booking not found' });
      if (
        booking.status !== BookingStatus.DRAFT &&
        booking.status !== BookingStatus.REVISION_REQUIRED
      )
        throw new BadRequestException({
          code: 'BOOKING_NOT_EDITABLE',
          message: 'Only draft or revision-required bookings can be edited',
        });
      const shipper = dto.sourceShipperId
        ? await tx.customerShipper.findFirst({
            where: {
              id: dto.sourceShipperId,
              tenantId: context.tenantId,
              customerCompanyId: context.customerCompanyId,
              status: 'ACTIVE',
            },
          })
        : null;
      if (dto.sourceShipperId && !shipper)
        throw new BadRequestException({
          code: 'SHIPPER_NOT_IN_CUSTOMER_SCOPE',
          message: 'The selected shipper is outside the current customer scope',
        });
      const updated = await tx.booking.update({
        where: { id },
        data: {
          commodity: dto.commodity?.trim(),
          packageType: dto.packageType,
          packages: dto.packages,
          grossWeight: dto.grossWeight ? new Prisma.Decimal(dto.grossWeight) : undefined,
          volumeCbm: dto.volumeCbm ? new Prisma.Decimal(dto.volumeCbm) : undefined,
          cargoReadyDate: dto.cargoReadyDate
            ? new Date(`${dto.cargoReadyDate}T00:00:00.000Z`)
            : undefined,
          isDangerousGoods: dto.isDangerousGoods,
          specialInstructions: dto.specialInstructions?.trim() || undefined,
          sourceShipperId: shipper?.id ?? dto.sourceShipperId,
          shipperName: shipper?.name ?? dto.shipperName?.trim(),
          shipperAddress: shipper?.address ?? dto.shipperAddress?.trim(),
          bookingContactName: dto.bookingContactName?.trim(),
          bookingContactEmail: dto.bookingContactEmail?.trim().toLowerCase(),
          bookingContactPhone: dto.bookingContactPhone?.trim(),
          updatedById: context.userId,
        },
        select: bookingSelect,
      });
      await tx.auditLog.create({
        data: {
          tenantId: context.tenantId,
          actorUserId: context.userId,
          entityType: 'Booking',
          entityId: id,
          action: 'UPDATE_DRAFT',
          beforeData: this.auditSnapshot(booking),
          afterData: this.auditSnapshot(updated),
        },
      });
      return updated;
    });
  }

  async submit(id: string) {
    const context = this.requireCustomer();
    const booking = await this.prisma.booking.findFirst({
      where: { id, tenantId: context.tenantId, customerCompanyId: context.customerCompanyId },
      include: { containerRequests: true },
    });
    if (!booking)
      throw new NotFoundException({ code: 'BOOKING_NOT_FOUND', message: 'Booking not found' });
    const missing = [
      'commodity',
      'packageType',
      'packages',
      'grossWeight',
      'volumeCbm',
      'cargoReadyDate',
      'shipperName',
      'shipperAddress',
      'bookingContactName',
    ].filter((key) => !booking[key as keyof typeof booking]);
    if (!booking.bookingContactEmail && !booking.bookingContactPhone)
      missing.push('bookingContactEmailOrPhone');
    if (booking.containerRequests.length === 0) missing.push('containerRequests');
    if (missing.length)
      throw new BadRequestException({
        code: 'BOOKING_INCOMPLETE',
        message: 'Complete required booking fields before submitting',
        details: { missing },
      });
    return this.transition(id, BookingStatus.SUBMITTED, {}, false);
  }

  async createShipment(id: string, dto: CreateShipmentDto) {
    const context = this.requireInternal();
    return this.prisma.$transaction(async (tx) => {
      const booking = await tx.booking.findFirst({
        where: {
          id,
          ...this.internalWhere(context),
          status: BookingStatus.BOOKED,
          documents: { some: { documentType: 'SO', status: 'ACTIVE', customerVisible: true } },
        },
        select: {
          id: true,
          customerCompanyId: true,
          carrierCode: true,
          polCode: true,
          podCode: true,
          etd: true,
        },
      });
      if (!booking)
        throw new NotFoundException({
          code: 'BOOKED_BOOKING_WITH_PUBLISHED_SO_NOT_FOUND',
          message: 'Booked booking with a published SO not found',
        });
      const existing = await tx.shipment.findFirst({
        where: { tenantId: context.tenantId, bookingId: id },
        select: { id: true },
      });
      if (existing)
        throw new BadRequestException({
          code: 'BOOKING_ALREADY_HAS_SHIPMENT',
          message: 'This booking already has a shipment in the V1 normal flow',
        });
      const now = new Date();
      const yearMonth = `${now.getUTCFullYear()}${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
      const counter = await tx.businessNumberCounter.upsert({
        where: {
          tenantId_type_yearMonth: { tenantId: context.tenantId, type: 'SHIPMENT', yearMonth },
        },
        create: { tenantId: context.tenantId, type: 'SHIPMENT', yearMonth, value: 1 },
        update: { value: { increment: 1 } },
        select: { value: true },
      });
      const shipmentNo = `SHP${yearMonth}${String(counter.value).padStart(6, '0')}`;
      const shipment = await tx.shipment.create({
        data: {
          tenantId: context.tenantId,
          shipmentNo,
          bookingId: id,
          customerCompanyId: booking.customerCompanyId,
          carrierCode: booking.carrierCode,
          vessel: dto.vessel?.trim(),
          voyage: dto.voyage?.trim(),
          polCode: booking.polCode,
          podCode: booking.podCode,
          etd: booking.etd,
          eta: dto.eta ? new Date(dto.eta) : undefined,
          createdById: context.userId,
        },
        select: shipmentSelect,
      });
      await tx.auditLog.create({
        data: {
          tenantId: context.tenantId,
          actorUserId: context.userId,
          entityType: 'Shipment',
          entityId: shipment.id,
          action: 'CREATE_FROM_BOOKING',
          afterData: { shipmentNo, bookingId: id, status: shipment.status },
        },
      });
      return shipment;
    });
  }

  cancel(id: string, dto: BookingActionDto) {
    return this.transition(id, BookingStatus.CANCELLED, dto, false);
  }
  approve(id: string, dto: BookingActionDto) {
    return this.internalTransition(id, BookingStatus.APPROVED, BookingReviewActionType.APPROVE, {
      internalRemark: dto.remark,
    });
  }
  requestRevision(id: string, dto: RequestBookingRevisionDto) {
    return this.internalTransition(
      id,
      BookingStatus.REVISION_REQUIRED,
      BookingReviewActionType.REQUEST_REVISION,
      dto,
    );
  }
  submitToCarrier(id: string, dto: SubmitBookingToCarrierDto) {
    return this.internalTransition(
      id,
      BookingStatus.BOOKING_SUBMITTED,
      BookingReviewActionType.SUBMIT_TO_CARRIER,
      {
        internalRemark: dto.internalRemark,
        carrierSourceName: dto.sourceName,
        carrierReference: dto.reference,
      },
    );
  }
  reject(id: string, dto: BookingActionDto) {
    if (!dto.remark)
      throw new BadRequestException({
        code: 'BOOKING_REJECTION_REASON_REQUIRED',
        message: 'A rejection reason is required',
      });
    return this.internalTransition(id, BookingStatus.REJECTED, BookingReviewActionType.REJECT, {
      customerVisibleRemark: dto.remark,
    });
  }
  cancelInternal(id: string, dto: BookingActionDto) {
    return this.internalTransition(id, BookingStatus.CANCELLED, BookingReviewActionType.CANCEL, {
      customerVisibleRemark: dto.remark,
    });
  }

  private async transition(
    id: string,
    target: BookingStatus,
    dto: BookingActionDto,
    internal: boolean,
  ) {
    const context = internal ? this.requireInternal() : this.requireCustomer();
    return this.prisma.$transaction(async (tx) => {
      const where = internal
        ? { id, ...this.internalWhere(context) }
        : { id, tenantId: context.tenantId, customerCompanyId: context.customerCompanyId };
      const booking = await tx.booking.findFirst({ where, select: { id: true, status: true } });
      if (!booking)
        throw new NotFoundException({ code: 'BOOKING_NOT_FOUND', message: 'Booking not found' });
      if (!this.stateMachine.canTransition(booking.status, target))
        throw new BadRequestException({
          code: 'ILLEGAL_BOOKING_TRANSITION',
          message: `Booking cannot transition from ${booking.status} to ${target}`,
          details: { from: booking.status, to: target },
        });
      const now = new Date();
      const changed = await tx.booking.updateMany({
        where: { id, tenantId: context.tenantId, status: booking.status },
        data: {
          status: target,
          lastStatusRemark: dto.remark?.trim(),
          updatedById: context.userId,
          ...(target === BookingStatus.SUBMITTED ? { submittedAt: now } : {}),
          ...(target === BookingStatus.REVISION_REQUIRED ? { revisionRequestedAt: now } : {}),
          ...(target === BookingStatus.APPROVED ? { approvedAt: now } : {}),
          ...(target === BookingStatus.BOOKING_SUBMITTED ? { bookingSubmittedAt: now } : {}),
          ...(target === BookingStatus.BOOKED ? { bookedAt: now } : {}),
          ...(target === BookingStatus.REJECTED ? { rejectedAt: now } : {}),
          ...(target === BookingStatus.CANCELLED ? { cancelledAt: now } : {}),
        },
      });
      if (changed.count !== 1)
        throw new BadRequestException({
          code: 'BOOKING_STATE_CONFLICT',
          message: 'Booking status changed; refresh and try again',
        });
      await tx.auditLog.create({
        data: {
          tenantId: context.tenantId,
          actorUserId: context.userId,
          entityType: 'Booking',
          entityId: id,
          action: `STATUS_${target}`,
          beforeData: { status: booking.status },
          afterData: { status: target, remark: dto.remark?.trim() },
        },
      });
      return tx.booking.findUniqueOrThrow({ where: { id }, select: bookingSelect });
    });
  }

  private async internalTransition(
    id: string,
    target: BookingStatus,
    action: BookingReviewActionType,
    details: {
      reasonCode?: RequestBookingRevisionDto['reasonCode'];
      customerVisibleRemark?: string;
      internalRemark?: string;
      carrierSourceName?: string;
      carrierReference?: string;
    },
  ) {
    const context = this.requireInternal();
    return this.prisma.$transaction(async (tx) => {
      const booking = await tx.booking.findFirst({
        where: { id, ...this.internalWhere(context) },
        select: { id: true, status: true },
      });
      if (!booking)
        throw new NotFoundException({ code: 'BOOKING_NOT_FOUND', message: 'Booking not found' });
      if (!this.stateMachine.canTransition(booking.status, target))
        throw new BadRequestException({
          code: 'ILLEGAL_BOOKING_TRANSITION',
          message: `Booking cannot transition from ${booking.status} to ${target}`,
          details: { from: booking.status, to: target },
        });
      const now = new Date();
      const changed = await tx.booking.updateMany({
        where: { id, tenantId: context.tenantId, status: booking.status },
        data: {
          status: target,
          lastStatusRemark: details.customerVisibleRemark?.trim(),
          updatedById: context.userId,
          ...(target === BookingStatus.REVISION_REQUIRED ? { revisionRequestedAt: now } : {}),
          ...(target === BookingStatus.APPROVED ? { approvedAt: now } : {}),
          ...(target === BookingStatus.BOOKING_SUBMITTED ? { bookingSubmittedAt: now } : {}),
          ...(target === BookingStatus.REJECTED ? { rejectedAt: now } : {}),
          ...(target === BookingStatus.CANCELLED ? { cancelledAt: now } : {}),
        },
      });
      if (changed.count !== 1)
        throw new BadRequestException({
          code: 'BOOKING_STATE_CONFLICT',
          message: 'Booking status changed; refresh and try again',
        });
      const reviewAction = await tx.bookingReviewAction.create({
        data: {
          tenantId: context.tenantId,
          bookingId: id,
          action,
          reasonCode: details.reasonCode,
          customerVisibleRemark: details.customerVisibleRemark?.trim(),
          internalRemark: details.internalRemark?.trim(),
          carrierSourceName: details.carrierSourceName?.trim(),
          carrierReference: details.carrierReference?.trim(),
          actorUserId: context.userId,
        },
      });
      await tx.auditLog.create({
        data: {
          tenantId: context.tenantId,
          actorUserId: context.userId,
          entityType: 'Booking',
          entityId: id,
          action: `STATUS_${target}`,
          beforeData: { status: booking.status },
          afterData: { status: target, reviewActionId: reviewAction.id },
        },
      });
      return tx.booking.findUniqueOrThrow({ where: { id }, select: bookingSelect });
    });
  }

  private async listScoped(query: ListBookingsDto, internal: boolean) {
    const context = internal ? this.requireInternal() : this.requireCustomer();
    const where: Prisma.BookingWhereInput = internal
      ? this.internalWhere(context)
      : { tenantId: context.tenantId, customerCompanyId: context.customerCompanyId };
    if (query.status) where.status = query.status;
    const [items, total] = await this.prisma.$transaction([
      this.prisma.booking.findMany({
        where,
        select: { ...bookingSelect, customer: { select: { id: true, name: true } } },
        orderBy: { createdAt: 'desc' },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.booking.count({ where }),
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
  private async getScoped(id: string, internal: boolean) {
    const context = internal ? this.requireInternal() : this.requireCustomer();
    const where = internal
      ? { id, ...this.internalWhere(context) }
      : { id, tenantId: context.tenantId, customerCompanyId: context.customerCompanyId };
    const booking = await this.prisma.booking.findFirst({
      where,
      select: {
        ...bookingSelect,
        customer: { select: { id: true, name: true } },
        reviewActions: {
          select: internal
            ? {
                id: true,
                action: true,
                reasonCode: true,
                customerVisibleRemark: true,
                internalRemark: true,
                carrierSourceName: true,
                carrierReference: true,
                createdAt: true,
                actor: { select: { displayName: true } },
              }
            : {
                id: true,
                action: true,
                reasonCode: true,
                customerVisibleRemark: true,
                createdAt: true,
              },
          orderBy: { createdAt: 'desc' },
        },
      },
    });
    if (!booking)
      throw new NotFoundException({ code: 'BOOKING_NOT_FOUND', message: 'Booking not found' });
    return booking;
  }
  private requireCustomer() {
    const c = this.requestContext.requireAuthenticated();
    if (!c.customerCompanyId)
      throw new ForbiddenException({
        code: 'CUSTOMER_BOOKING_SCOPE_REQUIRED',
        message: 'Customer booking access requires a customer account',
      });
    return c;
  }
  private requireInternal() {
    const c = this.requestContext.requireAuthenticated();
    if (c.customerCompanyId)
      throw new ForbiddenException({
        code: 'INTERNAL_BOOKING_SCOPE_REQUIRED',
        message: 'Internal booking access requires an internal account',
      });
    return c;
  }
  private internalWhere(context: {
    tenantId: string;
    userId: string;
    roles: RoleCode[];
  }): Prisma.BookingWhereInput {
    return {
      tenantId: context.tenantId,
      ...(context.roles.includes(RoleCode.SALES)
        ? { customer: { salesOwnerId: context.userId } }
        : {}),
    };
  }
  private auditSnapshot(value: {
    status: BookingStatus;
    commodity: string | null;
    packageType: string | null;
    packages: number | null;
    grossWeight: { toString(): string } | null;
    volumeCbm: { toString(): string } | null;
    cargoReadyDate: Date | null;
    isDangerousGoods: boolean;
    specialInstructions: string | null;
    sourceShipperId: string | null;
    shipperName: string | null;
    bookingContactName: string | null;
  }): Prisma.InputJsonObject {
    return {
      status: value.status,
      commodity: value.commodity,
      packageType: value.packageType,
      packages: value.packages,
      grossWeight: value.grossWeight?.toString() ?? null,
      volumeCbm: value.volumeCbm?.toString() ?? null,
      cargoReadyDate: value.cargoReadyDate?.toISOString().slice(0, 10) ?? null,
      isDangerousGoods: value.isDangerousGoods,
      specialInstructions: value.specialInstructions,
      sourceShipperId: value.sourceShipperId,
      shipperName: value.shipperName,
      bookingContactName: value.bookingContactName,
    };
  }

  private shipperAuditSnapshot(value: {
    name: string;
    address: string;
    isDefault: boolean;
    status: string;
    contactEmail: string | null;
    contactPhone: string | null;
  }): Prisma.InputJsonObject {
    return {
      name: value.name,
      address: value.address,
      isDefault: value.isDefault,
      status: value.status,
      hasContactEmail: Boolean(value.contactEmail),
      hasContactPhone: Boolean(value.contactPhone),
    };
  }
}
