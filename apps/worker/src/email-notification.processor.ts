import { NotificationChannel, NotificationStatus, type PrismaClient } from '@prisma/client';

export const EMAIL_NOTIFICATION_QUEUE = 'email-notifications';
export const SEND_EMAIL_NOTIFICATION_JOB = 'send-email-notification';

export interface EmailNotificationJobData {
  notificationId: string;
  tenantId: string;
}

export interface EmailDelivery {
  send(message: { to: string; subject: string; text: string }): Promise<void>;
}

function stringValue(value: unknown): string {
  return typeof value === 'string' || typeof value === 'number' ? String(value) : '';
}

export async function processEmailNotification(
  prisma: PrismaClient,
  delivery: EmailDelivery,
  data: EmailNotificationJobData,
): Promise<void> {
  const notification = await prisma.notification.findFirst({
    where: {
      id: data.notificationId,
      tenantId: data.tenantId,
      channel: NotificationChannel.EMAIL,
    },
  });
  if (!notification) throw new Error('Email notification not found in tenant scope');
  if (notification.status === NotificationStatus.SENT) return;

  await prisma.notification.update({
    where: { id: notification.id },
    data: { attempts: { increment: 1 }, status: NotificationStatus.PENDING, lastError: null },
  });
  try {
    const payload = notification.payload as Record<string, unknown>;
    await delivery.send({
      to: notification.recipient,
      subject: `Invoice ${stringValue(payload.invoiceNo)} issued`,
      text: `Your invoice ${stringValue(payload.invoiceNo)} for ${stringValue(payload.currency)} ${stringValue(payload.totalAmount)} has been issued. Due date: ${stringValue(payload.dueDate)}.`,
    });
    await prisma.notification.update({
      where: { id: notification.id },
      data: { status: NotificationStatus.SENT, sentAt: new Date(), failedAt: null },
    });
  } catch (error) {
    await prisma.notification.update({
      where: { id: notification.id },
      data: {
        status: NotificationStatus.FAILED,
        failedAt: new Date(),
        lastError: (error instanceof Error ? error.message : String(error)).slice(0, 1000),
      },
    });
    throw error;
  }
}
