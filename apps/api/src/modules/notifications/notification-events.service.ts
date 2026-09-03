import { Injectable } from '@nestjs/common';
import { NotificationChannel, UserStatus, type Prisma } from '@prisma/client';
import { NotificationQueueService, type EmailNotificationJobData } from './notification-queue.service.js';

type Tx = Prisma.TransactionClient;

interface CustomerNotificationInput {
  tenantId: string;
  customerCompanyId: string;
  type: string;
  payload: Prisma.InputJsonObject;
}

@Injectable()
export class NotificationEventsService {
  constructor(private readonly queue: NotificationQueueService) {}

  async createCustomerNotifications(
    tx: Tx,
    input: CustomerNotificationInput,
  ): Promise<EmailNotificationJobData[]> {
    const recipients = await tx.user.findMany({
      where: {
        tenantId: input.tenantId,
        customerCompanyId: input.customerCompanyId,
        status: UserStatus.ACTIVE,
      },
      select: { id: true, email: true },
    });
    const emailJobs: EmailNotificationJobData[] = [];
    for (const recipient of recipients) {
      await tx.notification.create({
        data: {
          tenantId: input.tenantId,
          recipientUserId: recipient.id,
          recipient: recipient.id,
          type: input.type,
          channel: NotificationChannel.IN_APP,
          payload: input.payload,
        },
      });
      const email = await tx.notification.create({
        data: {
          tenantId: input.tenantId,
          recipientUserId: recipient.id,
          recipient: recipient.email,
          type: input.type,
          channel: NotificationChannel.EMAIL,
          payload: input.payload,
        },
        select: { id: true },
      });
      emailJobs.push({ notificationId: email.id, tenantId: input.tenantId });
    }
    return emailJobs;
  }

  enqueueEmailNotifications(items: EmailNotificationJobData[]) {
    return this.queue.enqueueMany(items);
  }
}
