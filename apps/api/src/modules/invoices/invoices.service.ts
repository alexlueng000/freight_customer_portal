import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import {
  InvoiceStatus,
  NotificationChannel,
  Prisma,
  RoleCode,
  UserStatus,
} from '@prisma/client';
import { PrismaService } from '../../database/prisma.service.js';
import { RequestContextService } from '../../shared/request-context/request-context.service.js';
import type { CreateInvoiceDto } from './dto/create-invoice.dto.js';
import type { ListInvoicesDto } from './dto/list-invoices.dto.js';
import { InvoiceStateMachine } from './invoice-state-machine.js';
import { NotificationQueueService } from '../notifications/notification-queue.service.js';

const select = {
  id: true,
  invoiceNo: true,
  shipmentId: true,
  customerCompanyId: true,
  currency: true,
  subtotal: true,
  taxAmount: true,
  totalAmount: true,
  dueDate: true,
  status: true,
  issuedAt: true,
  confirmedAt: true,
  paidAt: true,
  voidedAt: true,
  createdAt: true,
  shipment: { select: { shipmentNo: true, polCode: true, podCode: true } },
  customer: { select: { id: true, name: true } },
  lines: { orderBy: { sortOrder: 'asc' as const } },
} satisfies Prisma.InvoiceSelect;

@Injectable()
export class InvoicesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly context: RequestContextService,
    private readonly machine: InvoiceStateMachine,
    private readonly notificationQueue: NotificationQueueService,
  ) {}

  list(query: ListInvoicesDto) {
    const context = this.context.requireAuthenticated();
    return this.prisma.invoice.findMany({
      where: {
        ...this.scope(context),
        ...(query.status ? { status: query.status } : {}),
        ...(query.shipmentId ? { shipmentId: query.shipmentId } : {}),
      },
      select,
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
  }

  async get(id: string) {
    const context = this.context.requireAuthenticated();
    const invoice = await this.prisma.invoice.findFirst({
      where: { id, ...this.scope(context) },
      select,
    });
    if (!invoice)
      throw new NotFoundException({ code: 'INVOICE_NOT_FOUND', message: 'Invoice not found' });
    return invoice;
  }

  create(dto: CreateInvoiceDto) {
    const context = this.requireInternal();
    const quantities = dto.lines.map((line) => new Prisma.Decimal(line.quantity));
    const prices = dto.lines.map((line) => new Prisma.Decimal(line.unitPrice));
    if (quantities.some((value) => value.lte(0)))
      throw new BadRequestException({
        code: 'INVOICE_QUANTITY_INVALID',
        message: 'Line quantity must be greater than zero',
      });
    const amounts = quantities.map((quantity, index) =>
      quantity.mul(prices[index]!).toDecimalPlaces(4),
    );
    const subtotal = amounts.reduce((sum, amount) => sum.add(amount), new Prisma.Decimal(0));
    const taxAmount = new Prisma.Decimal(dto.taxAmount);
    const totalAmount = subtotal.add(taxAmount);
    return this.prisma.$transaction(async (tx) => {
      const shipment = await tx.shipment.findFirst({
        where: { id: dto.shipmentId, tenantId: context.tenantId },
        select: { id: true, customerCompanyId: true },
      });
      if (!shipment)
        throw new NotFoundException({ code: 'SHIPMENT_NOT_FOUND', message: 'Shipment not found' });
      const now = new Date();
      const yearMonth = `${now.getUTCFullYear()}${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
      const counter = await tx.businessNumberCounter.upsert({
        where: {
          tenantId_type_yearMonth: { tenantId: context.tenantId, type: 'INVOICE', yearMonth },
        },
        create: { tenantId: context.tenantId, type: 'INVOICE', yearMonth, value: 1 },
        update: { value: { increment: 1 } },
        select: { value: true },
      });
      const invoiceNo = `INV${yearMonth}${String(counter.value).padStart(6, '0')}`;
      const invoice = await tx.invoice.create({
        data: {
          tenantId: context.tenantId,
          invoiceNo,
          shipmentId: shipment.id,
          customerCompanyId: shipment.customerCompanyId,
          currency: dto.currency,
          subtotal,
          taxAmount,
          totalAmount,
          dueDate: new Date(dto.dueDate),
          createdById: context.userId,
          lines: {
            create: dto.lines.map((line, index) => ({
              tenantId: context.tenantId,
              chargeCode: line.chargeCode,
              description: line.description.trim(),
              quantity: quantities[index]!,
              unitPrice: prices[index]!,
              amount: amounts[index]!,
              currency: dto.currency,
              sortOrder: index,
            })),
          },
        },
        select,
      });
      await tx.auditLog.create({
        data: {
          tenantId: context.tenantId,
          actorUserId: context.userId,
          entityType: 'Invoice',
          entityId: invoice.id,
          action: 'CREATE',
          afterData: {
            invoiceNo,
            shipmentId: shipment.id,
            currency: dto.currency,
            totalAmount: totalAmount.toString(),
            dueDate: dto.dueDate,
          },
        },
      });
      return invoice;
    });
  }

  issue(id: string) {
    return this.transition(id, InvoiceStatus.ISSUED, false);
  }
  confirm(id: string) {
    return this.transition(id, InvoiceStatus.CUSTOMER_CONFIRMED, true);
  }
  markPaid(id: string) {
    return this.transition(id, InvoiceStatus.PAID, false);
  }
  void(id: string) {
    return this.transition(id, InvoiceStatus.VOID, false);
  }

  private async transition(id: string, to: InvoiceStatus, customerOnly: boolean) {
    const context = this.context.requireAuthenticated();
    if (customerOnly ? !context.customerCompanyId : !!context.customerCompanyId)
      throw new NotFoundException({ code: 'INVOICE_NOT_FOUND', message: 'Invoice not found' });
    const result = await this.prisma.$transaction(async (tx) => {
      const current = await tx.invoice.findFirst({
        where: {
          id,
          tenantId: context.tenantId,
          ...(context.customerCompanyId ? { customerCompanyId: context.customerCompanyId } : {}),
        },
      });
      if (!current)
        throw new NotFoundException({ code: 'INVOICE_NOT_FOUND', message: 'Invoice not found' });
      this.machine.assertTransition(current.status, to);
      const now = new Date();
      const timestamps =
        to === InvoiceStatus.ISSUED
          ? { issuedAt: now }
          : to === InvoiceStatus.CUSTOMER_CONFIRMED
            ? { confirmedAt: now }
            : to === InvoiceStatus.PAID
              ? { paidAt: now }
              : to === InvoiceStatus.VOID
                ? { voidedAt: now }
                : {};
      const invoice = await tx.invoice.update({
        where: { id },
        data: { status: to, ...timestamps },
        select,
      });
      await tx.auditLog.create({
        data: {
          tenantId: context.tenantId,
          actorUserId: context.userId,
          entityType: 'Invoice',
          entityId: id,
          action: 'STATUS_TRANSITION',
          beforeData: { status: current.status },
          afterData: { status: to },
        },
      });
      const emailJobs: Array<{ notificationId: string; tenantId: string }> = [];
      if (to === InvoiceStatus.ISSUED) {
        const recipients = await tx.user.findMany({
          where: {
            tenantId: context.tenantId,
            customerCompanyId: current.customerCompanyId,
            status: UserStatus.ACTIVE,
          },
          select: { id: true, email: true },
        });
        const payload = {
          invoiceId: current.id,
          invoiceNo: current.invoiceNo,
          totalAmount: current.totalAmount.toString(),
          currency: current.currency,
          dueDate: current.dueDate.toISOString().slice(0, 10),
        };
        for (const recipient of recipients) {
          await tx.notification.create({
            data: {
              tenantId: context.tenantId,
              recipientUserId: recipient.id,
              recipient: recipient.id,
              type: 'INVOICE_ISSUED',
              channel: NotificationChannel.IN_APP,
              payload,
            },
          });
          const email = await tx.notification.create({
            data: {
              tenantId: context.tenantId,
              recipientUserId: recipient.id,
              recipient: recipient.email,
              type: 'INVOICE_ISSUED',
              channel: NotificationChannel.EMAIL,
              payload,
            },
            select: { id: true },
          });
          emailJobs.push({ notificationId: email.id, tenantId: context.tenantId });
        }
      }
      return { invoice, emailJobs };
    });
    await this.notificationQueue.enqueueMany(result.emailJobs);
    return result.invoice;
  }

  private requireInternal() {
    const context = this.context.requireAuthenticated();
    if (context.customerCompanyId)
      throw new NotFoundException({ code: 'INVOICE_NOT_FOUND', message: 'Invoice not found' });
    return context;
  }
  private scope(context: {
    tenantId: string;
    userId: string;
    customerCompanyId?: string;
    roles: RoleCode[];
  }): Prisma.InvoiceWhereInput {
    return {
      tenantId: context.tenantId,
      ...(context.customerCompanyId
        ? {
            customerCompanyId: context.customerCompanyId,
            status: {
              in: [InvoiceStatus.ISSUED, InvoiceStatus.CUSTOMER_CONFIRMED, InvoiceStatus.PAID],
            },
          }
        : context.roles.includes(RoleCode.SALES)
          ? { customer: { salesOwnerId: context.userId } }
          : {}),
    };
  }
}
