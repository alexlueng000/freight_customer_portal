import { Module } from '@nestjs/common';
import { CustomerRatePricingService } from '../rates/customer-rate-pricing.service.js';
import { QuotesController } from './quotes.controller.js';
import { AdminQuotesController } from './admin-quotes.controller.js';
import { QuoteStateMachine } from './quote-state-machine.js';
import { QuotePdfQueueService } from './quote-pdf-queue.service.js';
import { QuotesService } from './quotes.service.js';

@Module({
  controllers: [QuotesController, AdminQuotesController],
  providers: [QuotesService, CustomerRatePricingService, QuoteStateMachine, QuotePdfQueueService],
})
export class QuotesModule {}
