import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, RoleCode } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service.js';
import { RequestContextService } from '../../shared/request-context/request-context.service.js';

const select = {
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
  booking: { select: { bookingNo: true } },
  customer: { select: { id: true, name: true } },
} satisfies Prisma.ShipmentSelect;

@Injectable()
export class ShipmentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly requestContext: RequestContextService,
  ) {}

  list() {
    const context = this.requestContext.requireAuthenticated();
    return this.prisma.shipment.findMany({
      where: this.scope(context),
      select,
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
  }

  async get(id: string) {
    const context = this.requestContext.requireAuthenticated();
    const shipment = await this.prisma.shipment.findFirst({
      where: { id, ...this.scope(context) },
      select,
    });
    if (!shipment)
      throw new NotFoundException({ code: 'SHIPMENT_NOT_FOUND', message: 'Shipment not found' });
    return shipment;
  }

  private scope(context: {
    tenantId: string;
    userId: string;
    customerCompanyId?: string;
    roles: RoleCode[];
  }): Prisma.ShipmentWhereInput {
    return {
      tenantId: context.tenantId,
      ...(context.customerCompanyId
        ? { customerCompanyId: context.customerCompanyId }
        : context.roles.includes(RoleCode.SALES)
          ? { customer: { salesOwnerId: context.userId } }
          : {}),
    };
  }
}
