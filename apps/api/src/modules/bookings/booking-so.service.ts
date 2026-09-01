import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { BookingSoRecordStatus, BookingStatus, DocumentStatus, Prisma } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../../database/prisma.service.js';
import { RequestContextService } from '../../shared/request-context/request-context.service.js';
import { DocumentStorageService } from './document-storage.service.js';
import type { CreateBookingSoRecordDto } from './dto/create-booking-so-record.dto.js';

const soSelect = {
  id: true,
  bookingId: true,
  soNumber: true,
  sourceType: true,
  sourceName: true,
  carrierCode: true,
  vessel: true,
  voyage: true,
  etd: true,
  eta: true,
  cyCutoffAt: true,
  siCutoffAt: true,
  vgmCutoffAt: true,
  terminal: true,
  receivedAt: true,
  version: true,
  status: true,
  publishedAt: true,
  createdAt: true,
  document: {
    select: {
      id: true,
      originalFilename: true,
      mimeType: true,
      sizeBytes: true,
      version: true,
      customerVisible: true,
      status: true,
    },
  },
} satisfies Prisma.BookingSoRecordSelect;

@Injectable()
export class BookingSoService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly requestContext: RequestContextService,
    private readonly storage: DocumentStorageService,
  ) {}

  async listInternal(bookingId: string) {
    const context = this.requireInternal();
    await this.requireBooking(bookingId, context.tenantId);
    return this.prisma.bookingSoRecord.findMany({
      where: { tenantId: context.tenantId, bookingId },
      select: soSelect,
      orderBy: { version: 'desc' },
    });
  }

  async listCustomer(bookingId: string) {
    const context = this.requestContext.requireAuthenticated();
    if (!context.customerCompanyId)
      throw new ForbiddenException({
        code: 'CUSTOMER_BOOKING_SCOPE_REQUIRED',
        message: 'Customer booking access requires a customer account',
      });
    const booking = await this.prisma.booking.findFirst({
      where: {
        id: bookingId,
        tenantId: context.tenantId,
        customerCompanyId: context.customerCompanyId,
      },
      select: { id: true },
    });
    if (!booking)
      throw new NotFoundException({ code: 'BOOKING_NOT_FOUND', message: 'Booking not found' });
    return this.prisma.bookingSoRecord.findMany({
      where: {
        tenantId: context.tenantId,
        bookingId,
        status: BookingSoRecordStatus.PUBLISHED,
        document: { status: DocumentStatus.ACTIVE, customerVisible: true },
      },
      select: soSelect,
      orderBy: { version: 'desc' },
    });
  }

  create(bookingId: string, dto: CreateBookingSoRecordDto, file?: Express.Multer.File) {
    return this.uploadDraft(bookingId, dto, file);
  }

  async replace(
    bookingId: string,
    replacedSoId: string,
    dto: CreateBookingSoRecordDto,
    file?: Express.Multer.File,
  ) {
    const context = this.requireInternal();
    const replaced = await this.prisma.bookingSoRecord.findFirst({
      where: {
        id: replacedSoId,
        bookingId,
        tenantId: context.tenantId,
        status: BookingSoRecordStatus.PUBLISHED,
      },
      select: { id: true },
    });
    if (!replaced)
      throw new NotFoundException({
        code: 'PUBLISHED_SO_RECORD_NOT_FOUND',
        message: 'Published SO record to replace was not found',
      });
    return this.uploadDraft(bookingId, dto, file);
  }

  async publish(bookingId: string, soId: string) {
    const context = this.requireInternal();
    return this.prisma.$transaction(async (tx) => {
      const record = await tx.bookingSoRecord.findFirst({
        where: {
          id: soId,
          bookingId,
          tenantId: context.tenantId,
          status: BookingSoRecordStatus.INTERNAL_DRAFT,
          booking: { status: { in: [BookingStatus.BOOKING_SUBMITTED, BookingStatus.BOOKED] } },
        },
        select: {
          id: true,
          documentId: true,
          version: true,
          booking: { select: { status: true } },
        },
      });
      if (!record)
        throw new NotFoundException({
          code: 'PUBLISHABLE_SO_RECORD_NOT_FOUND',
          message: 'Publishable SO record not found',
        });
      const previous = await tx.bookingSoRecord.findMany({
        where: {
          tenantId: context.tenantId,
          bookingId,
          status: BookingSoRecordStatus.PUBLISHED,
          id: { not: soId },
        },
        select: { id: true, documentId: true },
      });
      if (previous.length) {
        await tx.bookingSoRecord.updateMany({
          where: { id: { in: previous.map((item) => item.id) }, tenantId: context.tenantId },
          data: { status: BookingSoRecordStatus.SUPERSEDED },
        });
        await tx.document.updateMany({
          where: {
            id: { in: previous.map((item) => item.documentId) },
            tenantId: context.tenantId,
          },
          data: { status: DocumentStatus.SUPERSEDED, customerVisible: false },
        });
      }
      const now = new Date();
      const published = await tx.bookingSoRecord.updateMany({
        where: {
          id: soId,
          tenantId: context.tenantId,
          status: BookingSoRecordStatus.INTERNAL_DRAFT,
        },
        data: {
          status: BookingSoRecordStatus.PUBLISHED,
          publishedById: context.userId,
          publishedAt: now,
        },
      });
      if (published.count !== 1)
        throw new BadRequestException({
          code: 'SO_PUBLISH_CONFLICT',
          message: 'SO record changed; refresh and try again',
        });
      await tx.document.update({
        where: { id: record.documentId },
        data: { status: DocumentStatus.ACTIVE, customerVisible: true },
      });
      if (record.booking.status === BookingStatus.BOOKING_SUBMITTED) {
        const booked = await tx.booking.updateMany({
          where: {
            id: bookingId,
            tenantId: context.tenantId,
            status: BookingStatus.BOOKING_SUBMITTED,
          },
          data: {
            status: BookingStatus.BOOKED,
            bookedAt: now,
            updatedById: context.userId,
            lastStatusRemark: 'SO published',
          },
        });
        if (booked.count !== 1)
          throw new BadRequestException({
            code: 'BOOKING_STATE_CONFLICT',
            message: 'Booking status changed; refresh and try again',
          });
      }
      await tx.auditLog.createMany({
        data: [
          {
            tenantId: context.tenantId,
            actorUserId: context.userId,
            entityType: 'BookingSoRecord',
            entityId: soId,
            action: 'PUBLISH',
            afterData: { bookingId, version: record.version, documentId: record.documentId },
          },
          {
            tenantId: context.tenantId,
            actorUserId: context.userId,
            entityType: 'Booking',
            entityId: bookingId,
            action: 'STATUS_BOOKED',
            beforeData: { status: record.booking.status },
            afterData: { status: BookingStatus.BOOKED, soRecordId: soId },
          },
        ],
      });
      return tx.bookingSoRecord.findUniqueOrThrow({ where: { id: soId }, select: soSelect });
    });
  }

  private async uploadDraft(
    bookingId: string,
    dto: CreateBookingSoRecordDto,
    file?: Express.Multer.File,
  ) {
    const context = this.requireInternal();
    this.validateFile(file);
    await this.requireBooking(bookingId, context.tenantId, [
      BookingStatus.BOOKING_SUBMITTED,
      BookingStatus.BOOKED,
    ]);
    const latest = await this.prisma.bookingSoRecord.aggregate({
      where: { tenantId: context.tenantId, bookingId },
      _max: { version: true },
    });
    const version = (latest._max.version ?? 0) + 1;
    const objectKey = `tenants/${context.tenantId}/bookings/${bookingId}/so/v${version}-${randomUUID()}`;
    await this.storage.upload(objectKey, file);
    try {
      return await this.prisma.$transaction(async (tx) => {
        const document = await tx.document.create({
          data: {
            tenantId: context.tenantId,
            bookingId,
            documentType: 'SO',
            objectKey,
            originalFilename: file.originalname.slice(0, 255),
            mimeType: file.mimetype,
            sizeBytes: file.size,
            version,
            customerVisible: false,
            uploadedById: context.userId,
          },
        });
        const record = await tx.bookingSoRecord.create({
          data: {
            tenantId: context.tenantId,
            bookingId,
            documentId: document.id,
            soNumber: dto.soNumber.trim(),
            sourceType: dto.sourceType,
            sourceName: dto.sourceName?.trim(),
            carrierCode: dto.carrierCode?.trim().toUpperCase(),
            vessel: dto.vessel?.trim(),
            voyage: dto.voyage?.trim(),
            etd: dto.etd ? new Date(dto.etd) : undefined,
            eta: dto.eta ? new Date(dto.eta) : undefined,
            cyCutoffAt: dto.cyCutoffAt ? new Date(dto.cyCutoffAt) : undefined,
            siCutoffAt: dto.siCutoffAt ? new Date(dto.siCutoffAt) : undefined,
            vgmCutoffAt: dto.vgmCutoffAt ? new Date(dto.vgmCutoffAt) : undefined,
            terminal: dto.terminal?.trim(),
            receivedAt: new Date(dto.receivedAt),
            version,
            uploadedById: context.userId,
          },
          select: soSelect,
        });
        await tx.auditLog.createMany({
          data: [
            {
              tenantId: context.tenantId,
              actorUserId: context.userId,
              entityType: 'Document',
              entityId: document.id,
              action: 'UPLOAD_SO_INTERNAL',
              afterData: { bookingId, version, customerVisible: false },
            },
            {
              tenantId: context.tenantId,
              actorUserId: context.userId,
              entityType: 'BookingSoRecord',
              entityId: record.id,
              action: 'CREATE_INTERNAL_DRAFT',
              afterData: { bookingId, version, documentId: document.id },
            },
          ],
        });
        return record;
      });
    } catch (error) {
      await this.storage.remove(objectKey);
      throw error;
    }
  }

  private validateFile(file?: Express.Multer.File): asserts file is Express.Multer.File {
    if (!file?.buffer.length)
      throw new BadRequestException({ code: 'SO_FILE_REQUIRED', message: 'SO file is required' });
    if (!new Set(['application/pdf', 'image/png', 'image/jpeg']).has(file.mimetype))
      throw new BadRequestException({
        code: 'SO_FILE_TYPE_INVALID',
        message: 'SO must be a PDF, PNG, or JPEG file',
      });
  }

  private async requireBooking(bookingId: string, tenantId: string, statuses?: BookingStatus[]) {
    const booking = await this.prisma.booking.findFirst({
      where: { id: bookingId, tenantId, ...(statuses ? { status: { in: statuses } } : {}) },
      select: { id: true },
    });
    if (!booking)
      throw new NotFoundException({ code: 'BOOKING_NOT_FOUND', message: 'Booking not found' });
    return booking;
  }

  private requireInternal() {
    const context = this.requestContext.requireAuthenticated();
    if (context.customerCompanyId)
      throw new ForbiddenException({
        code: 'INTERNAL_BOOKING_SCOPE_REQUIRED',
        message: 'Internal booking access requires an internal account',
      });
    return context;
  }
}
