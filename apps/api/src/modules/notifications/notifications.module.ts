import { Module } from '@nestjs/common';
import { NotificationEventsService } from './notification-events.service.js';
import { NotificationQueueService } from './notification-queue.service.js';
import { NotificationsController } from './notifications.controller.js';
import { NotificationsService } from './notifications.service.js';

@Module({
  controllers: [NotificationsController],
  providers: [NotificationsService, NotificationQueueService, NotificationEventsService],
  exports: [NotificationQueueService, NotificationEventsService],
})
export class NotificationsModule {}
