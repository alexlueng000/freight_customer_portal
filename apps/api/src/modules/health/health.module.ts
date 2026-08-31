import { Module } from '@nestjs/common';
import { BookingsModule } from '../bookings/bookings.module.js';
import { HealthController } from './health.controller.js';
import { HealthService } from './health.service.js';

@Module({
  imports: [BookingsModule],
  controllers: [HealthController],
  providers: [HealthService],
})
export class HealthModule {}
