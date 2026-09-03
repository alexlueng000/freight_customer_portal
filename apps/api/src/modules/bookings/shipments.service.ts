import { BadRequestException, Injectable, NotFoundException, Optional } from '@nestjs/common';
import { Prisma, RoleCode, ShipmentStatus } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service.js';
import { RequestContextService } from '../../shared/request-context/request-context.service.js';
import type { CreateContainerDto } from './dto/create-container.dto.js';
import type { CreateTrackingEventDto } from './dto/create-tracking-event.dto.js';
import type { ShipmentActionDto } from './dto/shipment-action.dto.js';
import type { UpdateShipmentDto } from './dto/update-shipment.dto.js';
import { ShipmentStateMachine } from './shipment-state-machine.js';
import { NotificationEventsService } from '../notifications/notification-events.service.js';

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
  atd: true,
  eta: true,
  ata: true,
  mblNo: true,
  hblNo: true,
  createdAt: true,
  booking: {
    select: {
      bookingNo: true,
      bookedAt: true,
      quote: { select: { sourceRate: { select: { polName: true, podName: true } } } },
      containerRequests: { select: { containerType: true, quantity: true }, orderBy: { sortOrder: 'asc' as const } },
    },
  },
  customer: { select: { id: true, name: true } },
} satisfies Prisma.ShipmentSelect;

@Injectable()
export class ShipmentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly requestContext: RequestContextService,
    private readonly stateMachine: ShipmentStateMachine,
    @Optional() private readonly notificationEvents?: NotificationEventsService,
  ) {}

  list() {
    const context = this.requestContext.requireAuthenticated();
    return this.prisma.shipment
      .findMany({ where: this.scope(context), select, orderBy: { createdAt: 'desc' }, take: 100 })
      .then((rows) => rows);
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

  async update(id: string, dto: UpdateShipmentDto) {
    const context = this.requireInternal();
    const current = await this.findInternal(id, context.tenantId);
    if (dto.etd && dto.eta && new Date(dto.eta) < new Date(dto.etd))
      throw new BadRequestException({
        code: 'ETA_BEFORE_ETD',
        message: 'ETA cannot be earlier than ETD',
      });
    const data = {
      ...(dto.vessel !== undefined ? { vessel: dto.vessel.trim() } : {}),
      ...(dto.voyage !== undefined ? { voyage: dto.voyage.trim() } : {}),
      ...(dto.etd !== undefined ? { etd: new Date(dto.etd) } : {}),
      ...(dto.eta !== undefined ? { eta: new Date(dto.eta) } : {}),
      ...(dto.mblNo !== undefined ? { mblNo: dto.mblNo.trim() || null } : {}),
      ...(dto.hblNo !== undefined ? { hblNo: dto.hblNo.trim() || null } : {}),
    };
    return this.prisma.$transaction(async (tx) => {
      const shipment = await tx.shipment.update({ where: { id: current.id }, data, select });
      await tx.auditLog.create({
        data: {
          tenantId: context.tenantId,
          actorUserId: context.userId,
          entityType: 'Shipment',
          entityId: id,
          action: 'UPDATE_DETAILS',
          beforeData: {
            vessel: current.vessel,
            voyage: current.voyage,
            etd: current.etd,
            eta: current.eta,
            mblNo: current.mblNo,
            hblNo: current.hblNo,
          },
          afterData: data,
        },
      });
      return shipment;
    });
  }

  async addContainer(id: string, dto: CreateContainerDto) {
    const context = this.requireInternal();
    await this.findInternal(id, context.tenantId);
    return this.prisma.$transaction(async (tx) => {
      const container = await tx.container.create({
        data: {
          tenantId: context.tenantId,
          shipmentId: id,
          containerNo: dto.containerNo.toUpperCase(),
          containerType: dto.containerType.toUpperCase(),
          sealNo: dto.sealNo?.trim(),
          vgmWeight: dto.vgmWeight ? new Prisma.Decimal(dto.vgmWeight) : undefined,
          pickupAt: dto.pickupAt ? new Date(dto.pickupAt) : undefined,
          gateInAt: dto.gateInAt ? new Date(dto.gateInAt) : undefined,
          loadedAt: dto.loadedAt ? new Date(dto.loadedAt) : undefined,
          dischargedAt: dto.dischargedAt ? new Date(dto.dischargedAt) : undefined,
        },
      });
      await tx.auditLog.create({
        data: {
          tenantId: context.tenantId,
          actorUserId: context.userId,
          entityType: 'Container',
          entityId: container.id,
          action: 'CREATE',
          afterData: {
            shipmentId: id,
            containerNo: container.containerNo,
            containerType: container.containerType,
          },
        },
      });
      return container;
    });
  }

  async addEvent(id: string, dto: CreateTrackingEventDto) {
    const context = this.requireInternal();
    await this.findInternal(id, context.tenantId);
    return this.prisma.$transaction(async (tx) => {
      const event = await tx.trackingEvent.create({
        data: {
          tenantId: context.tenantId,
          shipmentId: id,
          eventType: dto.eventType,
          eventTime: new Date(dto.eventTime),
          locationCode: dto.locationCode?.trim(),
          locationName: dto.locationName?.trim(),
          remark: dto.remark?.trim(),
          customerVisible: dto.customerVisible ?? true,
          createdById: context.userId,
        },
      });
      await tx.auditLog.create({
        data: {
          tenantId: context.tenantId,
          actorUserId: context.userId,
          entityType: 'TrackingEvent',
          entityId: event.id,
          action: 'CREATE',
          afterData: {
            shipmentId: id,
            eventType: event.eventType,
            eventTime: event.eventTime,
            customerVisible: event.customerVisible,
          },
        },
      });
      return event;
    });
  }

  transition(id: string, to: ShipmentStatus, dto: ShipmentActionDto) {
    const context = this.requireInternal();
    return this.prisma.$transaction(async (tx) => {
      const current = await tx.shipment.findFirst({ where: { id, tenantId: context.tenantId } });
      if (!current)
        throw new NotFoundException({ code: 'SHIPMENT_NOT_FOUND', message: 'Shipment not found' });
      this.stateMachine.assertTransition(current.status, to);
      if (to !== ShipmentStatus.CANCELLED && !dto.occurredAt)
        throw new BadRequestException({
          code: 'SHIPMENT_OCCURRED_AT_REQUIRED',
          message: 'Actual event time is required',
        });
      const occurredAt = dto.occurredAt ? new Date(dto.occurredAt) : new Date();
      if (to === ShipmentStatus.ARRIVED && current.atd && occurredAt < current.atd)
        throw new BadRequestException({
          code: 'ACTUAL_ARRIVAL_BEFORE_DEPARTURE',
          message: 'Actual arrival time cannot be earlier than actual departure time',
        });
      const times =
        to === ShipmentStatus.DEPARTED
          ? { atd: occurredAt }
          : to === ShipmentStatus.ARRIVED
            ? { ata: occurredAt }
              : {};
      const shipment = await tx.shipment.update({
        where: { id },
        data: { status: to, ...times },
        select,
      });
      await tx.trackingEvent.create({
        data: {
          tenantId: context.tenantId,
          shipmentId: id,
          eventType: `SHIPMENT_${to}`,
          eventTime: occurredAt,
          remark: dto.remark?.trim(),
          sourceType: 'SYSTEM',
          customerVisible: true,
          createdById: context.userId,
        },
      });
      await tx.auditLog.create({
        data: {
          tenantId: context.tenantId,
          actorUserId: context.userId,
          entityType: 'Shipment',
          entityId: id,
          action: 'STATUS_TRANSITION',
          beforeData: { status: current.status },
          afterData: { status: to, occurredAt, remark: dto.remark },
        },
      });
      const shouldNotify = to === ShipmentStatus.DEPARTED || to === ShipmentStatus.ARRIVED;
      const emailJobs = shouldNotify
        ? ((await this.notificationEvents?.createCustomerNotifications(tx, {
            tenantId: context.tenantId,
            customerCompanyId: current.customerCompanyId,
            type: to === ShipmentStatus.DEPARTED ? 'SHIPMENT_DEPARTED' : 'SHIPMENT_ARRIVED',
            payload: {
              title: to === ShipmentStatus.DEPARTED ? 'Shipment 已开船' : 'Shipment 已到港',
              description:
                to === ShipmentStatus.DEPARTED
                  ? `${shipment.shipmentNo} 已进入运输中。`
                  : `${shipment.shipmentNo} 已到达目的港。`,
              shipmentId: shipment.id,
              shipmentNo: shipment.shipmentNo,
              polCode: shipment.polCode,
              podCode: shipment.podCode,
              occurredAt: occurredAt.toISOString(),
              href: `/portal/shipments/${shipment.id}`,
            },
          })) ?? [])
        : [];
      return { shipment, emailJobs };
    }).then(async (result) => {
      await this.notificationEvents?.enqueueEmailNotifications(result.emailJobs);
      return result.shipment;
    });
  }

  private async findInternal(id: string, tenantId: string) {
    const row = await this.prisma.shipment.findFirst({ where: { id, tenantId } });
    if (!row)
      throw new NotFoundException({ code: 'SHIPMENT_NOT_FOUND', message: 'Shipment not found' });
    return row;
  }
  private requireInternal() {
    const context = this.requestContext.requireAuthenticated();
    if (context.customerCompanyId)
      throw new NotFoundException({ code: 'SHIPMENT_NOT_FOUND', message: 'Shipment not found' });
    return context;
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
