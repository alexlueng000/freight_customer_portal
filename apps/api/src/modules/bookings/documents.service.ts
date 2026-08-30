import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { UploadShipmentDocumentDto } from './dto/upload-shipment-document.dto.js';
import { DocumentStatus, Prisma, RoleCode } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service.js';
import { RequestContextService } from '../../shared/request-context/request-context.service.js';
import { DocumentStorageService } from './document-storage.service.js';

const select = {
  id: true,
  bookingId: true,
  shipmentId: true,
  invoiceId: true,
  documentType: true,
  originalFilename: true,
  mimeType: true,
  sizeBytes: true,
  version: true,
  customerVisible: true,
  status: true,
  createdAt: true,
} satisfies Prisma.DocumentSelect;

@Injectable()
export class DocumentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly requestContext: RequestContextService,
    private readonly storage: DocumentStorageService,
  ) {}

  async listForBooking(bookingId: string) {
    const context = this.requestContext.requireAuthenticated();
    const bookingWhere: Prisma.BookingWhereInput = {
      id: bookingId,
      tenantId: context.tenantId,
      ...(context.customerCompanyId
        ? { customerCompanyId: context.customerCompanyId }
        : context.roles.includes(RoleCode.SALES)
          ? { customer: { salesOwnerId: context.userId } }
          : {}),
    };
    if (!(await this.prisma.booking.findFirst({ where: bookingWhere, select: { id: true } })))
      throw new NotFoundException({ code: 'BOOKING_NOT_FOUND', message: 'Booking not found' });
    return this.prisma.document.findMany({
      where: {
        tenantId: context.tenantId,
        bookingId,
        status: DocumentStatus.ACTIVE,
        ...(context.customerCompanyId ? { customerVisible: true } : {}),
      },
      select,
      orderBy: [{ documentType: 'asc' }, { version: 'desc' }],
    });
  }

  async download(id: string) {
    const context = this.requestContext.requireAuthenticated();
    const document = await this.prisma.document.findFirst({
      where: {
        id,
        tenantId: context.tenantId,
        status: DocumentStatus.ACTIVE,
        ...(context.customerCompanyId
          ? {
              customerVisible: true,
              OR: [
                { booking: { customerCompanyId: context.customerCompanyId } },
                { shipment: { customerCompanyId: context.customerCompanyId } },
                {
                  invoice: {
                    customerCompanyId: context.customerCompanyId,
                    status: { in: ['ISSUED', 'CUSTOMER_CONFIRMED', 'PAID'] },
                  },
                },
              ],
            }
          : {}),
      },
      select: { ...select, objectKey: true },
    });
    if (!document)
      throw new NotFoundException({ code: 'DOCUMENT_NOT_FOUND', message: 'Document not found' });
    const buffer = await this.storage.download(document.objectKey);
    await this.prisma.auditLog.create({
      data: {
        tenantId: context.tenantId,
        actorUserId: context.userId,
        entityType: 'Document',
        entityId: id,
        action: 'DOWNLOAD',
        afterData: { documentType: document.documentType, version: document.version },
      },
    });
    return { document, buffer };
  }

  async listForShipment(shipmentId: string) {
    const context = this.requestContext.requireAuthenticated();
    const shipment = await this.prisma.shipment.findFirst({
      where: {
        id: shipmentId,
        tenantId: context.tenantId,
        ...(context.customerCompanyId
          ? { customerCompanyId: context.customerCompanyId }
          : context.roles.includes(RoleCode.SALES)
            ? { customer: { salesOwnerId: context.userId } }
            : {}),
      },
      select: { id: true },
    });
    if (!shipment)
      throw new NotFoundException({ code: 'SHIPMENT_NOT_FOUND', message: 'Shipment not found' });
    return this.prisma.document.findMany({
      where: {
        tenantId: context.tenantId,
        shipmentId,
        status: DocumentStatus.ACTIVE,
        ...(context.customerCompanyId ? { customerVisible: true } : {}),
      },
      select,
      orderBy: [{ documentType: 'asc' }, { version: 'desc' }],
    });
  }

  async uploadForShipment(
    shipmentId: string,
    dto: UploadShipmentDocumentDto,
    file?: Express.Multer.File,
  ) {
    const context = this.requestContext.requireAuthenticated();
    if (context.customerCompanyId)
      throw new NotFoundException({ code: 'SHIPMENT_NOT_FOUND', message: 'Shipment not found' });
    if (!file)
      throw new BadRequestException({
        code: 'DOCUMENT_FILE_REQUIRED',
        message: 'A document file is required',
      });
    const allowed = new Set(['application/pdf', 'image/png', 'image/jpeg']);
    if (!allowed.has(file.mimetype))
      throw new BadRequestException({
        code: 'DOCUMENT_TYPE_NOT_ALLOWED',
        message: 'Only PDF, PNG, and JPEG files are allowed',
      });
    const shipment = await this.prisma.shipment.findFirst({
      where: { id: shipmentId, tenantId: context.tenantId },
      select: { id: true },
    });
    if (!shipment)
      throw new NotFoundException({ code: 'SHIPMENT_NOT_FOUND', message: 'Shipment not found' });
    const objectKey = `${context.tenantId}/shipments/${shipmentId}/${dto.documentType}/${randomUUID()}`;
    await this.storage.upload(objectKey, file);
    try {
      return await this.prisma.$transaction(async (tx) => {
        const latest = await tx.document.findFirst({
          where: {
            tenantId: context.tenantId,
            shipmentId,
            documentType: dto.documentType,
            status: DocumentStatus.ACTIVE,
          },
          orderBy: { version: 'desc' },
        });
        if (latest)
          await tx.document.update({
            where: { id: latest.id },
            data: { status: DocumentStatus.SUPERSEDED },
          });
        const document = await tx.document.create({
          data: {
            tenantId: context.tenantId,
            shipmentId,
            documentType: dto.documentType,
            objectKey,
            originalFilename: file.originalname,
            mimeType: file.mimetype,
            sizeBytes: file.size,
            version: (latest?.version ?? 0) + 1,
            customerVisible: dto.customerVisible,
            uploadedById: context.userId,
          },
          select,
        });
        await tx.auditLog.create({
          data: {
            tenantId: context.tenantId,
            actorUserId: context.userId,
            entityType: 'Document',
            entityId: document.id,
            action: 'UPLOAD_VERSION',
            afterData: {
              shipmentId,
              documentType: dto.documentType,
              version: document.version,
              customerVisible: dto.customerVisible,
            },
          },
        });
        return document;
      });
    } catch (error) {
      await this.storage.remove(objectKey);
      throw error;
    }
  }

  async listForInvoice(invoiceId: string) {
    const context = this.requestContext.requireAuthenticated();
    const invoice = await this.prisma.invoice.findFirst({
      where: {
        id: invoiceId,
        tenantId: context.tenantId,
        ...(context.customerCompanyId
          ? {
              customerCompanyId: context.customerCompanyId,
              status: { in: ['ISSUED', 'CUSTOMER_CONFIRMED', 'PAID'] },
            }
          : context.roles.includes(RoleCode.SALES)
            ? { customer: { salesOwnerId: context.userId } }
            : {}),
      },
      select: { id: true },
    });
    if (!invoice)
      throw new NotFoundException({ code: 'INVOICE_NOT_FOUND', message: 'Invoice not found' });
    return this.prisma.document.findMany({
      where: {
        tenantId: context.tenantId,
        invoiceId,
        status: DocumentStatus.ACTIVE,
        ...(context.customerCompanyId ? { customerVisible: true } : {}),
      },
      select,
      orderBy: { version: 'desc' },
    });
  }

  async uploadForInvoice(invoiceId: string, file?: Express.Multer.File) {
    const context = this.requestContext.requireAuthenticated();
    if (context.customerCompanyId)
      throw new NotFoundException({ code: 'INVOICE_NOT_FOUND', message: 'Invoice not found' });
    if (!file)
      throw new BadRequestException({
        code: 'DOCUMENT_FILE_REQUIRED',
        message: 'An invoice document file is required',
      });
    const allowed = new Set(['application/pdf', 'image/png', 'image/jpeg']);
    if (!allowed.has(file.mimetype))
      throw new BadRequestException({
        code: 'DOCUMENT_TYPE_NOT_ALLOWED',
        message: 'Only PDF, PNG, and JPEG files are allowed',
      });
    const invoice = await this.prisma.invoice.findFirst({
      where: { id: invoiceId, tenantId: context.tenantId },
      select: { id: true },
    });
    if (!invoice)
      throw new NotFoundException({ code: 'INVOICE_NOT_FOUND', message: 'Invoice not found' });

    const objectKey = `${context.tenantId}/invoices/${invoiceId}/${randomUUID()}`;
    await this.storage.upload(objectKey, file);
    try {
      return await this.prisma.$transaction(async (tx) => {
        const latest = await tx.document.findFirst({
          where: {
            tenantId: context.tenantId,
            invoiceId,
            documentType: 'INVOICE',
            status: DocumentStatus.ACTIVE,
          },
          orderBy: { version: 'desc' },
        });
        if (latest)
          await tx.document.update({
            where: { id: latest.id },
            data: { status: DocumentStatus.SUPERSEDED },
          });
        const document = await tx.document.create({
          data: {
            tenantId: context.tenantId,
            invoiceId,
            documentType: 'INVOICE',
            objectKey,
            originalFilename: file.originalname,
            mimeType: file.mimetype,
            sizeBytes: file.size,
            version: (latest?.version ?? 0) + 1,
            customerVisible: true,
            uploadedById: context.userId,
          },
          select,
        });
        await tx.auditLog.create({
          data: {
            tenantId: context.tenantId,
            actorUserId: context.userId,
            entityType: 'Document',
            entityId: document.id,
            action: 'UPLOAD_VERSION',
            afterData: {
              invoiceId,
              documentType: 'INVOICE',
              version: document.version,
              customerVisible: true,
            },
          },
        });
        return document;
      });
    } catch (error) {
      await this.storage.remove(objectKey);
      throw error;
    }
  }
}
