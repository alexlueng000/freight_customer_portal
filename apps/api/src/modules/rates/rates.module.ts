import { Module } from '@nestjs/common';
import { RatesController } from './rates.controller.js';
import { RatesService } from './rates.service.js';
import { RateImportQueueService } from './rate-import-queue.service.js';
import { RateImportsService } from './rate-imports.service.js';
import { RateImportsController } from './rate-imports.controller.js';
import { CustomerRatesController } from './customer-rates.controller.js';
import { CustomerRatesService } from './customer-rates.service.js';
import { CustomerRatePricingService } from './customer-rate-pricing.service.js';
@Module({ controllers: [RatesController, RateImportsController, CustomerRatesController], providers: [RatesService, RateImportsService, RateImportQueueService, CustomerRatesService, CustomerRatePricingService] })
export class RatesModule {}
