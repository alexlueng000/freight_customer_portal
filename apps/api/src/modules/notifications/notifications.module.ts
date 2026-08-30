import { Module } from '@nestjs/common';
import { NotificationQueueService } from './notification-queue.service.js';
import { NotificationsController } from './notifications.controller.js';
import { NotificationsService } from './notifications.service.js';

@Module({
  controllers: [NotificationsController],
  providers: [NotificationsService, NotificationQueueService],
  exports: [NotificationQueueService],
})
export class NotificationsModule {}
