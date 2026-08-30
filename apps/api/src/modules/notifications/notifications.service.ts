import { Injectable, NotFoundException } from '@nestjs/common';
import { NotificationChannel } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service.js';
import { RequestContextService } from '../../shared/request-context/request-context.service.js';

@Injectable()
export class NotificationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly context: RequestContextService,
  ) {}

  list() {
    const context = this.context.requireAuthenticated();
    return this.prisma.notification.findMany({
      where: {
        tenantId: context.tenantId,
        recipientUserId: context.userId,
        channel: NotificationChannel.IN_APP,
      },
      select: {
        id: true,
        type: true,
        payload: true,
        readAt: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
  }

  async markRead(id: string) {
    const context = this.context.requireAuthenticated();
    const result = await this.prisma.notification.updateMany({
      where: {
        id,
        tenantId: context.tenantId,
        recipientUserId: context.userId,
        channel: NotificationChannel.IN_APP,
      },
      data: { readAt: new Date() },
    });
    if (!result.count)
      throw new NotFoundException({
        code: 'NOTIFICATION_NOT_FOUND',
        message: 'Notification not found',
      });
    return { id, read: true };
  }
}
