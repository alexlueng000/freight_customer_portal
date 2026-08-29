import { Injectable, NotFoundException } from '@nestjs/common';
import { DocumentStatus, Prisma, RoleCode } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service.js';
import { RequestContextService } from '../../shared/request-context/request-context.service.js';
import { DocumentStorageService } from './document-storage.service.js';

const select = {
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
}
