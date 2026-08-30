import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { BookingStatus, Prisma, QuoteStatus, RoleCode } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service.js';
import { RequestContextService } from '../../shared/request-context/request-context.service.js';
import { BookingStateMachine } from './booking-state-machine.js';
import { DocumentStorageService } from './document-storage.service.js';
import type { BookingActionDto } from './dto/booking-action.dto.js';
import type { CreateShipmentDto } from './dto/create-shipment.dto.js';
import type { CreateBookingDto } from './dto/create-booking.dto.js';
import type { ListBookingsDto } from './dto/list-bookings.dto.js';
import type { UpdateBookingDto } from './dto/update-booking.dto.js';

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
  packages: true,
  grossWeight: true,
  volumeCbm: true,
  isDangerousGoods: true,
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

const documentSelect = {
  id: true,
  bookingId: true,
  shipmentId: true,
  documentType: true,
  originalFilename: true,
  mimeType: true,
  sizeBytes: true,
  version: true,
  customerVisible: true,
  status: true,
  createdAt: true,
} satisfies Prisma.DocumentSelect;

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

@Injectable()
export class BookingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly requestContext: RequestContextService,
    private readonly stateMachine: BookingStateMachine,
    private readonly storage: DocumentStorageService,
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
      const contact = await tx.customerContact.findFirst({
        where: {
          tenantId: context.tenantId,
          customerCompanyId: context.customerCompanyId,
          isBookingContact: true,
        },
        orderBy: [{ isPrimary: 'desc' }, { createdAt: 'asc' }],
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
          bookingContactName: contact?.name,
          bookingContactEmail: contact?.email,
          bookingContactPhone: contact?.phone,
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

  async update(id: string, dto: UpdateBookingDto) {
    const context = this.requireCustomer();
    return this.prisma.$transaction(async (tx) => {
      const booking = await tx.booking.findFirst({
        where: { id, tenantId: context.tenantId, customerCompanyId: context.customerCompanyId },
        include: { containerRequests: true },
      });
      if (!booking)
        throw new NotFoundException({ code: 'BOOKING_NOT_FOUND', message: 'Booking not found' });
      if (booking.status !== BookingStatus.DRAFT)
        throw new BadRequestException({
          code: 'BOOKING_NOT_EDITABLE',
          message: 'Only draft bookings can be edited',
        });
      if (dto.containerRequests) {
        const unique = new Set(
          dto.containerRequests.map((item) => item.containerType.toUpperCase()),
        );
        if (unique.size !== dto.containerRequests.length)
          throw new BadRequestException({
            code: 'DUPLICATE_CONTAINER_TYPE',
            message: 'Container types must be unique',
          });
        await tx.bookingContainerRequest.deleteMany({
          where: { bookingId: id, tenantId: context.tenantId },
        });
        await tx.bookingContainerRequest.createMany({
          data: dto.containerRequests.map((item, sortOrder) => ({
            tenantId: context.tenantId,
            bookingId: id,
            containerType: item.containerType.toUpperCase(),
            quantity: item.quantity,
            weightPerContainer: item.weightPerContainer
              ? new Prisma.Decimal(item.weightPerContainer)
              : null,
            remark: item.remark?.trim() || null,
            sortOrder,
          })),
        });
      }
      const updated = await tx.booking.update({
        where: { id },
        data: {
          commodity: dto.commodity?.trim(),
          packages: dto.packages,
          grossWeight: dto.grossWeight ? new Prisma.Decimal(dto.grossWeight) : undefined,
          volumeCbm: dto.volumeCbm ? new Prisma.Decimal(dto.volumeCbm) : undefined,
          isDangerousGoods: dto.isDangerousGoods,
          shipperName: dto.shipperName?.trim(),
          shipperAddress: dto.shipperAddress?.trim(),
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
      'packages',
      'grossWeight',
      'volumeCbm',
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

  async releaseSo(id: string, file: Express.Multer.File | undefined) {
    const context = this.requireInternal();
    if (!file?.buffer.length)
      throw new BadRequestException({ code: 'SO_FILE_REQUIRED', message: 'SO file is required' });
    const allowedTypes = new Set(['application/pdf', 'image/png', 'image/jpeg']);
    if (!allowedTypes.has(file.mimetype))
      throw new BadRequestException({
        code: 'SO_FILE_TYPE_INVALID',
        message: 'SO must be a PDF, PNG, or JPEG file',
      });
    const booking = await this.prisma.booking.findFirst({
      where: { id, ...this.internalWhere(context), status: BookingStatus.CONFIRMED },
      select: { id: true, status: true },
    });
    if (!booking)
      throw new NotFoundException({
        code: 'CONFIRMED_BOOKING_NOT_FOUND',
        message: 'Confirmed booking not found',
      });
    const latest = await this.prisma.document.aggregate({
      where: { tenantId: context.tenantId, bookingId: id, documentType: 'SO' },
      _max: { version: true },
    });
    const version = (latest._max.version ?? 0) + 1;
    const objectKey = `tenants/${context.tenantId}/bookings/${id}/so/v${version}-${randomUUID()}`;
    await this.storage.upload(objectKey, file);
    try {
      return await this.prisma.$transaction(async (tx) => {
        const changed = await tx.booking.updateMany({
          where: {
            id,
            tenantId: context.tenantId,
            status: BookingStatus.CONFIRMED,
          },
          data: {
            status: BookingStatus.SO_RELEASED,
            updatedById: context.userId,
            lastStatusRemark: 'SO released to customer',
          },
        });
        if (changed.count !== 1)
          throw new BadRequestException({
            code: 'BOOKING_STATE_CONFLICT',
            message: 'Booking status changed; refresh and try again',
          });
        const document = await tx.document.create({
          data: {
            tenantId: context.tenantId,
            bookingId: id,
            documentType: 'SO',
            objectKey,
            originalFilename: file.originalname.slice(0, 255),
            mimeType: file.mimetype,
            sizeBytes: file.size,
            version,
            customerVisible: true,
            uploadedById: context.userId,
          },
          select: documentSelect,
        });
        await tx.auditLog.createMany({
          data: [
            {
              tenantId: context.tenantId,
              actorUserId: context.userId,
              entityType: 'Document',
              entityId: document.id,
              action: 'UPLOAD_SO',
              afterData: { bookingId: id, version, customerVisible: true },
            },
            {
              tenantId: context.tenantId,
              actorUserId: context.userId,
              entityType: 'Booking',
              entityId: id,
              action: 'STATUS_SO_RELEASED',
              beforeData: { status: BookingStatus.CONFIRMED },
              afterData: { status: BookingStatus.SO_RELEASED, documentId: document.id },
            },
          ],
        });
        return document;
      });
    } catch (error) {
      await this.storage.remove(objectKey);
      throw error;
    }
  }

  async createShipment(id: string, dto: CreateShipmentDto) {
    const context = this.requireInternal();
    return this.prisma.$transaction(async (tx) => {
      const booking = await tx.booking.findFirst({
        where: { id, ...this.internalWhere(context), status: BookingStatus.SO_RELEASED },
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
          code: 'SO_RELEASED_BOOKING_NOT_FOUND',
          message: 'SO-released booking not found',
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
  review(id: string, dto: BookingActionDto) {
    return this.transition(id, BookingStatus.UNDER_REVIEW, dto, true);
  }
  confirm(id: string, dto: BookingActionDto) {
    return this.transition(id, BookingStatus.CONFIRMED, dto, true);
  }
  reject(id: string, dto: BookingActionDto) {
    if (!dto.remark)
      throw new BadRequestException({
        code: 'BOOKING_REJECTION_REASON_REQUIRED',
        message: 'A rejection reason is required',
      });
    return this.transition(id, BookingStatus.REJECTED, dto, true);
  }
  cancelInternal(id: string, dto: BookingActionDto) {
    return this.transition(id, BookingStatus.CANCELLED, dto, true);
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
          ...(target === BookingStatus.UNDER_REVIEW ? { underReviewAt: now } : {}),
          ...(target === BookingStatus.CONFIRMED ? { confirmedAt: now } : {}),
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
      select: { ...bookingSelect, customer: { select: { id: true, name: true } } },
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
    packages: number | null;
    grossWeight: { toString(): string } | null;
    volumeCbm: { toString(): string } | null;
    isDangerousGoods: boolean;
    shipperName: string | null;
    bookingContactName: string | null;
  }): Prisma.InputJsonObject {
    return {
      status: value.status,
      commodity: value.commodity,
      packages: value.packages,
      grossWeight: value.grossWeight?.toString() ?? null,
      volumeCbm: value.volumeCbm?.toString() ?? null,
      isDangerousGoods: value.isDangerousGoods,
      shipperName: value.shipperName,
      bookingContactName: value.bookingContactName,
    };
  }
}
