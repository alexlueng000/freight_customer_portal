import { Injectable, Logger, type OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Queue } from 'bullmq';

export const EMAIL_NOTIFICATION_QUEUE = 'email-notifications';
export const SEND_EMAIL_NOTIFICATION_JOB = 'send-email-notification';

export interface EmailNotificationJobData {
  notificationId: string;
  tenantId: string;
}

@Injectable()
export class NotificationQueueService implements OnModuleDestroy {
  private readonly logger = new Logger(NotificationQueueService.name);
  private readonly queue: Queue<EmailNotificationJobData>;

  constructor(config: ConfigService) {
    this.queue = new Queue(EMAIL_NOTIFICATION_QUEUE, {
      connection: {
        host: config.get('REDIS_HOST') ?? 'localhost',
        port: Number(config.get('REDIS_PORT') ?? 6379),
        password: config.get('REDIS_PASSWORD') || undefined,
      },
    });
  }

  async enqueueMany(items: EmailNotificationJobData[]): Promise<void> {
    if (!items.length) return;
    try {
      await this.queue.addBulk(
        items.map((data) => ({
          name: SEND_EMAIL_NOTIFICATION_JOB,
          data,
          opts: {
            jobId: data.notificationId,
            attempts: 3,
            backoff: { type: 'exponential', delay: 5_000 },
            removeOnComplete: 1000,
            removeOnFail: 5000,
          },
        })),
      );
    } catch (error) {
      this.logger.error('Failed to enqueue email notifications', error);
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.queue.close();
  }
}
