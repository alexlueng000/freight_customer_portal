import { ForbiddenException, Injectable } from '@nestjs/common';
import {
  BookingStatus,
  CustomerStatus,
  InvoiceStatus,
  NotificationChannel,
  QuoteStatus,
  RateStatus,
  RoleCode,
  ShipmentStatus,
  UserStatus,
  type Prisma,
} from '@prisma/client';
import { PrismaService } from '../../database/prisma.service.js';
import { RequestContextService } from '../../shared/request-context/request-context.service.js';

@Injectable()
export class DashboardService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly context: RequestContextService,
  ) {}

  async admin() {
    const context = this.context.requireAuthenticated();
    if (context.customerCompanyId) {
      throw new ForbiddenException({
        code: 'INTERNAL_DASHBOARD_REQUIRED',
        message: 'Admin dashboard requires an internal account',
      });
    }
    const roleView = resolveAdminRoleView(context.roles);
    if (roleView.code === 'SALES') return this.salesAdmin(context, roleView);
    if (roleView.code === 'FINANCE') return this.financeAdmin(context, roleView);
    if (roleView.code === 'TENANT_ADMIN') return this.tenantAdmin(context, roleView);
    return this.operationAdmin(context, roleView);
  }

  private async operationAdmin(
    context: { tenantId: string; userId: string; roles: RoleCode[] },
    roleView: AdminRoleView,
  ) {
    const bookingWhere = this.internalBookingWhere(context, roleView.code);
    const shipmentWhere = this.internalShipmentWhere(context, roleView.code);
    const invoiceWhere = this.internalInvoiceWhere(context, roleView.code);
    const [
      bookingCounts,
      shipmentCounts,
      invoiceCounts,
      unreadCount,
      bookings,
      shipments,
      notifications,
    ] = await Promise.all([
      this.prisma.booking.groupBy({
        by: ['status'],
        where: bookingWhere,
        _count: { _all: true },
      }),
      this.prisma.shipment.groupBy({
        by: ['status'],
        where: shipmentWhere,
        _count: { _all: true },
      }),
      this.prisma.invoice.groupBy({
        by: ['status'],
        where: invoiceWhere,
        _count: { _all: true },
      }),
      this.unreadCount(context.tenantId, context.userId),
      this.prisma.booking.findMany({
        where: {
          ...bookingWhere,
          status: {
            in: [BookingStatus.SUBMITTED, BookingStatus.APPROVED, BookingStatus.BOOKING_SUBMITTED],
          },
        },
        select: {
          id: true,
          bookingNo: true,
          status: true,
          polCode: true,
          podCode: true,
          createdAt: true,
          customer: { select: { name: true } },
        },
        orderBy: { updatedAt: 'desc' },
        take: 8,
      }),
      this.prisma.shipment.findMany({
        where: {
          ...shipmentWhere,
          status: { in: [ShipmentStatus.PLANNED, ShipmentStatus.DEPARTED] },
        },
        select: {
          id: true,
          shipmentNo: true,
          status: true,
          polCode: true,
          podCode: true,
          eta: true,
          customer: { select: { name: true } },
        },
        orderBy: { updatedAt: 'desc' },
        take: 4,
      }),
      this.notifications(context.tenantId, context.userId, 6),
    ]);
    const submittedBookings = countStatus(bookingCounts, BookingStatus.SUBMITTED);
    const bookingSubmitted = countStatus(bookingCounts, BookingStatus.BOOKING_SUBMITTED);
    const departedShipments = countStatus(shipmentCounts, ShipmentStatus.DEPARTED);
    const issuedInvoices = countStatus(invoiceCounts, InvoiceStatus.ISSUED);
    return {
      roleView,
      stats: {
        submittedBookings,
        bookingSubmitted,
        departedShipments,
        issuedInvoices,
        unreadNotifications: unreadCount,
      },
      summary: [
        {
          label: '待审核 Booking',
          value: submittedBookings,
          href: '/admin/bookings?status=SUBMITTED',
          tone: 'warning',
          description: '客户已提交，等待资料审核',
        },
        {
          label: '待登记 SO',
          value: bookingSubmitted,
          href: '/admin/bookings?status=BOOKING_SUBMITTED',
          tone: 'info',
          description: '已提交船司，等待订舱结果',
        },
        {
          label: '运输中 Shipment',
          value: departedShipments,
          href: '/admin/shipments?status=DEPARTED',
          tone: 'success',
          description: '需要跟进到港和节点',
        },
        {
          label: '未读通知',
          value: unreadCount,
          href: '#notifications',
          tone: 'neutral',
          description: '与当前账号相关的协同事件',
        },
      ],
      tasks: [
        ...bookings.map((booking) => ({
          id: booking.id,
          type: 'BOOKING',
          title: `${booking.bookingNo} · ${booking.customer.name}`,
          status: booking.status,
          route: `${booking.polCode} → ${booking.podCode}`,
          href: `/admin/bookings/${booking.id}`,
          actionLabel: adminBookingAction(booking.status),
        })),
        ...shipments.map((shipment) => ({
          id: shipment.id,
          type: 'SHIPMENT',
          title: `${shipment.shipmentNo} · ${shipment.customer.name}`,
          status: shipment.status,
          route: `${shipment.polCode} → ${shipment.podCode}`,
          href: `/admin/shipments/${shipment.id}`,
          actionLabel: shipment.status === ShipmentStatus.PLANNED ? '确认开船' : '更新到港',
        })),
      ],
      notifications,
    };
  }

  private async salesAdmin(
    context: { tenantId: string; userId: string; roles: RoleCode[] },
    roleView: AdminRoleView,
  ) {
    const quoteWhere = this.internalQuoteWhere(context, roleView.code);
    const bookingWhere = this.internalBookingWhere(context, roleView.code);
    const shipmentWhere = this.internalShipmentWhere(context, roleView.code);
    const [
      quoteCounts,
      bookingCounts,
      shipmentCounts,
      unreadCount,
      quotes,
      bookings,
      notifications,
    ] = await Promise.all([
      this.prisma.quote.groupBy({ by: ['status'], where: quoteWhere, _count: { _all: true } }),
      this.prisma.booking.groupBy({ by: ['status'], where: bookingWhere, _count: { _all: true } }),
      this.prisma.shipment.groupBy({
        by: ['status'],
        where: shipmentWhere,
        _count: { _all: true },
      }),
      this.unreadCount(context.tenantId, context.userId),
      this.prisma.quote.findMany({
        where: {
          ...quoteWhere,
          status: { in: [QuoteStatus.DRAFT, QuoteStatus.SENT, QuoteStatus.VIEWED] },
        },
        select: {
          id: true,
          quoteNo: true,
          status: true,
          polCode: true,
          podCode: true,
          totalAmount: true,
          currency: true,
          customer: { select: { name: true } },
        },
        orderBy: { updatedAt: 'desc' },
        take: 8,
      }),
      this.prisma.booking.findMany({
        where: {
          ...bookingWhere,
          status: { in: [BookingStatus.SUBMITTED, BookingStatus.APPROVED] },
        },
        select: {
          id: true,
          bookingNo: true,
          status: true,
          polCode: true,
          podCode: true,
          customer: { select: { name: true } },
        },
        orderBy: { updatedAt: 'desc' },
        take: 4,
      }),
      this.notifications(context.tenantId, context.userId, 6),
    ]);
    const draftQuotes = countStatus(quoteCounts, QuoteStatus.DRAFT);
    const sentQuotes =
      countStatus(quoteCounts, QuoteStatus.SENT) + countStatus(quoteCounts, QuoteStatus.VIEWED);
    const acceptedQuotes = countStatus(quoteCounts, QuoteStatus.ACCEPTED);
    const activeShipments =
      countStatus(shipmentCounts, ShipmentStatus.PLANNED) +
      countStatus(shipmentCounts, ShipmentStatus.DEPARTED);
    return {
      roleView,
      stats: {
        submittedBookings: countStatus(bookingCounts, BookingStatus.SUBMITTED),
        bookingSubmitted: countStatus(bookingCounts, BookingStatus.BOOKING_SUBMITTED),
        departedShipments: countStatus(shipmentCounts, ShipmentStatus.DEPARTED),
        issuedInvoices: 0,
        unreadNotifications: unreadCount,
        draftQuotes,
        sentQuotes,
        acceptedQuotes,
        activeShipments,
      },
      summary: [
        {
          label: '待确认报价',
          value: draftQuotes,
          href: '/admin/quotes?status=DRAFT',
          tone: 'warning',
          description: '需要审核、定价并发送客户',
        },
        {
          label: '客户可确认报价',
          value: sentQuotes,
          href: '/admin/quotes?status=SENT',
          tone: 'info',
          description: '已发送或已查看，等待客户决定',
        },
        {
          label: '已接受报价',
          value: acceptedQuotes,
          href: '/admin/quotes?status=ACCEPTED',
          tone: 'success',
          description: '可继续跟进订舱转化',
        },
        {
          label: '负责客户出运',
          value: activeShipments,
          href: '/admin/shipments',
          tone: 'neutral',
          description: '销售负责客户的在途履约',
        },
      ],
      tasks: [
        ...quotes.map((quote) => ({
          id: quote.id,
          type: 'QUOTE',
          title: `${quote.quoteNo} · ${quote.customer.name}`,
          status: quote.status,
          route: `${quote.polCode} → ${quote.podCode}`,
          href: `/admin/quotes/${quote.id}`,
          actionLabel: salesQuoteAction(quote.status),
          meta: `${quote.currency} ${quote.totalAmount.toString()}`,
        })),
        ...bookings.map((booking) => ({
          id: booking.id,
          type: 'BOOKING',
          title: `${booking.bookingNo} · ${booking.customer.name}`,
          status: booking.status,
          route: `${booking.polCode} → ${booking.podCode}`,
          href: `/admin/bookings/${booking.id}`,
          actionLabel: adminBookingAction(booking.status),
        })),
      ],
      notifications,
    };
  }

  private async financeAdmin(
    context: { tenantId: string; userId: string; roles: RoleCode[] },
    roleView: AdminRoleView,
  ) {
    const invoiceWhere = this.internalInvoiceWhere(context, roleView.code);
    const [invoiceCounts, unreadCount, invoices, notifications] = await Promise.all([
      this.prisma.invoice.groupBy({ by: ['status'], where: invoiceWhere, _count: { _all: true } }),
      this.unreadCount(context.tenantId, context.userId),
      this.prisma.invoice.findMany({
        where: {
          ...invoiceWhere,
          status: {
            in: [InvoiceStatus.DRAFT, InvoiceStatus.ISSUED, InvoiceStatus.CUSTOMER_CONFIRMED],
          },
        },
        select: {
          id: true,
          invoiceNo: true,
          status: true,
          totalAmount: true,
          currency: true,
          dueDate: true,
          customer: { select: { name: true } },
        },
        orderBy: [{ status: 'asc' }, { dueDate: 'asc' }],
        take: 10,
      }),
      this.notifications(context.tenantId, context.userId, 6),
    ]);
    const draftInvoices = countStatus(invoiceCounts, InvoiceStatus.DRAFT);
    const issuedInvoices = countStatus(invoiceCounts, InvoiceStatus.ISSUED);
    const customerConfirmedInvoices = countStatus(invoiceCounts, InvoiceStatus.CUSTOMER_CONFIRMED);
    const paidInvoices = countStatus(invoiceCounts, InvoiceStatus.PAID);
    return {
      roleView,
      stats: {
        submittedBookings: 0,
        bookingSubmitted: 0,
        departedShipments: 0,
        issuedInvoices,
        unreadNotifications: unreadCount,
        draftInvoices,
        customerConfirmedInvoices,
        paidInvoices,
      },
      summary: [
        {
          label: '待开票',
          value: draftInvoices,
          href: '/admin/invoices?status=DRAFT',
          tone: 'warning',
          description: '草稿账单需要核对并发送',
        },
        {
          label: '待客户确认',
          value: issuedInvoices,
          href: '/admin/invoices?status=ISSUED',
          tone: 'info',
          description: '已发送客户的账单',
        },
        {
          label: '待确认收款',
          value: customerConfirmedInvoices,
          href: '/admin/invoices?status=CUSTOMER_CONFIRMED',
          tone: 'success',
          description: '客户已确认，等待财务收款处理',
        },
        {
          label: '已收款',
          value: paidInvoices,
          href: '/admin/invoices?status=PAID',
          tone: 'neutral',
          description: '当前租户已完成账单',
        },
      ],
      tasks: invoices.map((invoice) => ({
        id: invoice.id,
        type: 'INVOICE',
        title: `${invoice.invoiceNo} · ${invoice.customer.name}`,
        status: invoice.status,
        route: `到期 ${invoice.dueDate.toISOString().slice(0, 10)}`,
        href: `/admin/invoices/${invoice.id}`,
        actionLabel: financeInvoiceAction(invoice.status),
        meta: `${invoice.currency} ${invoice.totalAmount.toString()}`,
      })),
      notifications,
    };
  }

  private async tenantAdmin(
    context: { tenantId: string; userId: string; roles: RoleCode[] },
    roleView: AdminRoleView,
  ) {
    const [
      customers,
      users,
      rates,
      quotes,
      bookings,
      invoices,
      unreadCount,
      ownerlessCustomers,
      inactiveUsers,
      notifications,
    ] = await Promise.all([
      this.prisma.customerCompany.groupBy({
        by: ['status'],
        where: { tenantId: context.tenantId },
        _count: { _all: true },
      }),
      this.prisma.user.groupBy({
        by: ['status'],
        where: { tenantId: context.tenantId },
        _count: { _all: true },
      }),
      this.prisma.rate.count({ where: { tenantId: context.tenantId, status: RateStatus.ACTIVE } }),
      this.prisma.quote.count({ where: { tenantId: context.tenantId, status: QuoteStatus.DRAFT } }),
      this.prisma.booking.count({
        where: { tenantId: context.tenantId, status: BookingStatus.SUBMITTED },
      }),
      this.prisma.invoice.count({
        where: { tenantId: context.tenantId, status: InvoiceStatus.ISSUED },
      }),
      this.unreadCount(context.tenantId, context.userId),
      this.prisma.customerCompany.findMany({
        where: { tenantId: context.tenantId, salesOwnerId: null },
        select: { id: true, name: true, code: true, status: true },
        orderBy: { updatedAt: 'desc' },
        take: 5,
      }),
      this.prisma.user.findMany({
        where: { tenantId: context.tenantId, status: { not: UserStatus.ACTIVE } },
        select: { id: true, displayName: true, email: true, status: true },
        orderBy: { updatedAt: 'desc' },
        take: 5,
      }),
      this.notifications(context.tenantId, context.userId, 6),
    ]);
    const activeCustomers = countStatus(customers, CustomerStatus.ACTIVE);
    const activeUsers = countStatus(users, UserStatus.ACTIVE);
    return {
      roleView,
      stats: {
        submittedBookings: bookings,
        bookingSubmitted: 0,
        departedShipments: 0,
        issuedInvoices: invoices,
        unreadNotifications: unreadCount,
        activeCustomers,
        activeUsers,
        activeRates: rates,
        draftQuotes: quotes,
      },
      summary: [
        {
          label: '活跃客户',
          value: activeCustomers,
          href: '/admin/customers',
          tone: 'success',
          description: '当前可服务的客户公司',
        },
        {
          label: '活跃用户',
          value: activeUsers,
          href: '/admin/users',
          tone: 'info',
          description: '内部与客户账号总览',
        },
        {
          label: '有效运价',
          value: rates,
          href: '/admin/rates',
          tone: 'neutral',
          description: '可用于客户查价和报价',
        },
        {
          label: '全局待处理',
          value: quotes + bookings + invoices,
          href: '/admin',
          tone: 'warning',
          description: '报价、订舱和账单待办合计',
        },
      ],
      tasks: [
        ...ownerlessCustomers.map((customer) => ({
          id: customer.id,
          type: 'CUSTOMER',
          title: `${customer.name} · ${customer.code}`,
          status: customer.status,
          route: '未分配销售负责人',
          href: `/admin/customers/${customer.id}`,
          actionLabel: '分配负责人',
        })),
        ...inactiveUsers.map((user) => ({
          id: user.id,
          type: 'USER',
          title: `${user.displayName} · ${user.email}`,
          status: user.status,
          route: '账号状态需要确认',
          href: '/admin/users',
          actionLabel: '查看用户',
        })),
      ],
      notifications,
    };
  }

  async portal() {
    const context = this.context.requireAuthenticated();
    if (!context.customerCompanyId) {
      throw new ForbiddenException({
        code: 'CUSTOMER_DASHBOARD_REQUIRED',
        message: 'Portal dashboard requires a customer account',
      });
    }
    const customerScope = {
      tenantId: context.tenantId,
      customerCompanyId: context.customerCompanyId,
    };
    const quoteActionWhere: Prisma.QuoteWhereInput = {
      ...customerScope,
      OR: [
        {
          status: { in: [QuoteStatus.SENT, QuoteStatus.VIEWED] },
          validUntil: { gte: todayUtcDate() },
        },
        {
          status: QuoteStatus.ACCEPTED,
          bookings: { none: {} },
        },
      ],
    };
    const [
      bookingCounts,
      shipmentCounts,
      invoiceCounts,
      pendingQuoteCount,
      unreadCount,
      quotes,
      bookings,
      invoices,
      shipments,
      notifications,
    ] = await Promise.all([
      this.prisma.booking.groupBy({
        by: ['status'],
        where: customerScope,
        _count: { _all: true },
      }),
      this.prisma.shipment.groupBy({
        by: ['status'],
        where: customerScope,
        _count: { _all: true },
      }),
      this.prisma.invoice.groupBy({
        by: ['status'],
        where: {
          ...customerScope,
          status: {
            in: [InvoiceStatus.ISSUED, InvoiceStatus.CUSTOMER_CONFIRMED, InvoiceStatus.PAID],
          },
        },
        _count: { _all: true },
      }),
      this.prisma.quote.count({ where: quoteActionWhere }),
      this.unreadCount(context.tenantId, context.userId),
      this.prisma.quote.findMany({
        where: quoteActionWhere,
        select: {
          id: true,
          quoteNo: true,
          status: true,
          polCode: true,
          podCode: true,
          carrierCode: true,
          validUntil: true,
          totalAmount: true,
          currency: true,
        },
        orderBy: [{ validUntil: 'asc' }, { updatedAt: 'desc' }],
        take: 6,
      }),
      this.prisma.booking.findMany({
        where: {
          ...customerScope,
          status: { in: [BookingStatus.DRAFT, BookingStatus.REVISION_REQUIRED] },
        },
        select: {
          id: true,
          bookingNo: true,
          status: true,
          polCode: true,
          podCode: true,
          carrierCode: true,
        },
        orderBy: { updatedAt: 'desc' },
        take: 6,
      }),
      this.prisma.invoice.findMany({
        where: { ...customerScope, status: InvoiceStatus.ISSUED },
        select: { id: true, invoiceNo: true, status: true, totalAmount: true, currency: true },
        orderBy: { issuedAt: 'desc' },
        take: 4,
      }),
      this.prisma.shipment.findMany({
        where: {
          ...customerScope,
          status: { in: [ShipmentStatus.PLANNED, ShipmentStatus.DEPARTED] },
        },
        select: {
          id: true,
          shipmentNo: true,
          status: true,
          polCode: true,
          podCode: true,
          eta: true,
        },
        orderBy: { updatedAt: 'desc' },
        take: 8,
      }),
      this.notifications(context.tenantId, context.userId, 5),
    ]);
    return {
      stats: {
        pendingQuotes: pendingQuoteCount,
        actionBookings:
          countStatus(bookingCounts, BookingStatus.DRAFT) +
          countStatus(bookingCounts, BookingStatus.REVISION_REQUIRED),
        activeShipments:
          countStatus(shipmentCounts, ShipmentStatus.PLANNED) +
          countStatus(shipmentCounts, ShipmentStatus.DEPARTED),
        issuedInvoices: countStatus(invoiceCounts, InvoiceStatus.ISSUED),
        unreadNotifications: unreadCount,
      },
      actions: [
        ...quotes.map((quote) => ({
          id: quote.id,
          type: 'QUOTE',
          title:
            quote.status === QuoteStatus.ACCEPTED
              ? `${quote.quoteNo} 已接受，待创建订舱`
              : `${quote.quoteNo} 待确认`,
          status: quote.status,
          description: `${quote.polCode} → ${quote.podCode} · ${quote.carrierCode ?? '船司待确认'} · ${quote.currency} ${quote.totalAmount.toString()} · 有效期至 ${quote.validUntil.toISOString().slice(0, 10)}`,
          href: `/portal/quotes/${quote.id}`,
          actionLabel: quote.status === QuoteStatus.ACCEPTED ? '创建订舱' : '确认报价',
        })),
        ...bookings.map((booking) => ({
          id: booking.id,
          type: 'BOOKING',
          title:
            booking.status === BookingStatus.REVISION_REQUIRED
              ? `${booking.bookingNo} 需要补充资料`
              : `${booking.bookingNo} 尚未提交`,
          status: booking.status,
          description: `${booking.polCode} → ${booking.podCode} · ${booking.carrierCode ?? '船司待确认'}`,
          href: `/portal/bookings/${booking.id}`,
          actionLabel: '继续填写',
        })),
        ...invoices.map((invoice) => ({
          id: invoice.id,
          type: 'INVOICE',
          title: `${invoice.invoiceNo} 待确认`,
          status: invoice.status,
          description: `${invoice.currency} ${invoice.totalAmount.toString()}`,
          href: `/portal/billing/${invoice.id}`,
          actionLabel: '查看账单',
        })),
      ],
      recentShipments: shipments.map((shipment) => ({
        ...shipment,
        eta: shipment.eta?.toISOString() ?? null,
      })),
      notifications,
    };
  }

  private unreadCount(tenantId: string, userId: string) {
    return this.prisma.notification.count({
      where: {
        tenantId,
        recipientUserId: userId,
        channel: NotificationChannel.IN_APP,
        readAt: null,
      },
    });
  }

  private notifications(tenantId: string, userId: string, take: number) {
    return this.prisma.notification.findMany({
      where: {
        tenantId,
        recipientUserId: userId,
        channel: NotificationChannel.IN_APP,
        readAt: null,
      },
      select: {
        id: true,
        type: true,
        payload: true,
        readAt: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
      take,
    });
  }

  private internalBookingWhere(
    context: {
      tenantId: string;
      userId: string;
      roles: RoleCode[];
    },
    roleViewCode = resolveAdminRoleView(context.roles).code,
  ): Prisma.BookingWhereInput {
    const salesScoped = roleViewCode === 'SALES';
    return {
      tenantId: context.tenantId,
      ...(salesScoped ? { customer: { salesOwnerId: context.userId } } : {}),
    };
  }

  private internalQuoteWhere(
    context: {
      tenantId: string;
      userId: string;
      roles: RoleCode[];
    },
    roleViewCode = resolveAdminRoleView(context.roles).code,
  ): Prisma.QuoteWhereInput {
    if (roleViewCode === 'SALES') {
      return {
        tenantId: context.tenantId,
        OR: [
          { salesOwnerId: context.userId },
          {
            salesOwnerId: null,
            customer: { salesOwnerId: context.userId },
          },
        ],
      };
    }
    return { tenantId: context.tenantId };
  }

  private internalShipmentWhere(
    context: {
      tenantId: string;
      userId: string;
      roles: RoleCode[];
    },
    roleViewCode = resolveAdminRoleView(context.roles).code,
  ): Prisma.ShipmentWhereInput {
    const salesScoped = roleViewCode === 'SALES';
    return {
      tenantId: context.tenantId,
      ...(salesScoped ? { customer: { salesOwnerId: context.userId } } : {}),
    };
  }

  private internalInvoiceWhere(
    context: {
      tenantId: string;
      userId: string;
      roles: RoleCode[];
    },
    roleViewCode = resolveAdminRoleView(context.roles).code,
  ): Prisma.InvoiceWhereInput {
    const salesScoped = roleViewCode === 'SALES';
    return {
      tenantId: context.tenantId,
      ...(salesScoped ? { customer: { salesOwnerId: context.userId } } : {}),
    };
  }
}

export interface AdminRoleView {
  code: 'SALES' | 'OPERATION' | 'FINANCE' | 'TENANT_ADMIN';
  title: string;
  description: string;
  primaryActionLabel: string;
  primaryActionHref: string;
}

function resolveAdminRoleView(roles: RoleCode[]): AdminRoleView {
  if (roles.includes(RoleCode.TENANT_ADMIN) || roles.includes(RoleCode.SUPER_ADMIN)) {
    return {
      code: 'TENANT_ADMIN',
      title: '租户管理 Dashboard',
      description: '关注用户、客户、有效运价和跨团队未处理事项。',
      primaryActionLabel: '管理用户',
      primaryActionHref: '/admin/users',
    };
  }
  if (roles.includes(RoleCode.SALES)) {
    return {
      code: 'SALES',
      title: 'Sales Dashboard',
      description: '聚焦负责客户的报价确认、报价跟进和订舱转化。',
      primaryActionLabel: '查看报价',
      primaryActionHref: '/admin/quotes',
    };
  }
  if (roles.includes(RoleCode.FINANCE)) {
    return {
      code: 'FINANCE',
      title: 'Finance Dashboard',
      description: '聚焦待开票、客户确认和收款状态。',
      primaryActionLabel: '查看发票',
      primaryActionHref: '/admin/invoices',
    };
  }
  return {
    code: 'OPERATION',
    title: 'Operation Dashboard',
    description: '聚焦订舱审核、SO 登记、Shipment 节点和单证履约。',
    primaryActionLabel: '查看订舱',
    primaryActionHref: '/admin/bookings',
  };
}

function salesQuoteAction(status: QuoteStatus) {
  if (status === QuoteStatus.DRAFT) return '审核并发送';
  if (status === QuoteStatus.SENT || status === QuoteStatus.VIEWED) return '跟进客户';
  if (status === QuoteStatus.ACCEPTED) return '跟进订舱';
  return '查看报价';
}

function financeInvoiceAction(status: InvoiceStatus) {
  if (status === InvoiceStatus.DRAFT) return '核对并发送';
  if (status === InvoiceStatus.ISSUED) return '跟进确认';
  if (status === InvoiceStatus.CUSTOMER_CONFIRMED) return '确认收款';
  return '查看账单';
}

function countStatus<T extends string>(
  rows: Array<{ status: T; _count: { _all: number } }>,
  status: T,
) {
  return rows.find((row) => row.status === status)?._count._all ?? 0;
}

function todayUtcDate() {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

function adminBookingAction(status: BookingStatus) {
  if (status === BookingStatus.SUBMITTED) return '审核资料';
  if (status === BookingStatus.APPROVED) return '提交订舱';
  return '登记 SO';
}
