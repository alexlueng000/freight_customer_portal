import { NotificationChannel, NotificationStatus, type PrismaClient } from '@prisma/client';
import { processEmailNotification } from './email-notification.processor.js';

describe('processEmailNotification', () => {
  it('uses notification payload copy for shipment and booking event emails', async () => {
    const send = jest.fn().mockResolvedValue(undefined);
    const prisma = prismaFor({
      id: 'notification-1',
      tenantId: 'tenant-1',
      recipient: 'customer@example.test',
      type: 'SHIPMENT_DEPARTED',
      channel: NotificationChannel.EMAIL,
      status: NotificationStatus.PENDING,
      payload: {
        title: 'Shipment 已开船',
        description: 'SHP202609000001 已进入运输中。',
        href: '/portal/shipments/shipment-1',
      },
    });

    await processEmailNotification(prisma, { send }, {
      notificationId: 'notification-1',
      tenantId: 'tenant-1',
    });

    expect(send).toHaveBeenCalledWith({
      to: 'customer@example.test',
      subject: 'Shipment 已开船',
      text: 'SHP202609000001 已进入运输中。\n\nOpen: /portal/shipments/shipment-1',
    });
  });

  it('keeps the invoice email fallback for existing invoice notifications', async () => {
    const send = jest.fn().mockResolvedValue(undefined);
    const prisma = prismaFor({
      id: 'notification-2',
      tenantId: 'tenant-1',
      recipient: 'customer@example.test',
      type: 'INVOICE_ISSUED',
      channel: NotificationChannel.EMAIL,
      status: NotificationStatus.PENDING,
      payload: {
        invoiceNo: 'INV202609000001',
        currency: 'USD',
        totalAmount: '1200.00',
        dueDate: '2026-09-30',
      },
    });

    await processEmailNotification(prisma, { send }, {
      notificationId: 'notification-2',
      tenantId: 'tenant-1',
    });

    expect(send).toHaveBeenCalledWith({
      to: 'customer@example.test',
      subject: 'Invoice INV202609000001 issued',
      text: 'Your invoice INV202609000001 for USD 1200.00 has been issued. Due date: 2026-09-30.',
    });
  });
});

function prismaFor(notification: Record<string, unknown>) {
  return {
    notification: {
      findFirst: jest.fn().mockResolvedValue(notification),
      update: jest.fn().mockResolvedValue(notification),
    },
  } as unknown as PrismaClient;
}
