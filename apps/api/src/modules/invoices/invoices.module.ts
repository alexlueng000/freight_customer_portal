import { Module } from '@nestjs/common';
import { AdminInvoicesController } from './admin-invoices.controller.js';
import { InvoiceStateMachine } from './invoice-state-machine.js';
import { InvoicesController } from './invoices.controller.js';
import { InvoicesService } from './invoices.service.js';
import { NotificationsModule } from '../notifications/notifications.module.js';

@Module({
  imports: [NotificationsModule],
  controllers: [InvoicesController, AdminInvoicesController],
  providers: [InvoicesService, InvoiceStateMachine],
})
export class InvoicesModule {}
