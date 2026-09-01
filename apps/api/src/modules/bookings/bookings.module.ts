import { Module } from '@nestjs/common';
import { AdminBookingsController } from './admin-bookings.controller.js';
import { BookingStateMachine } from './booking-state-machine.js';
import { AdminBookingSoController, CustomerBookingSoController } from './booking-so.controller.js';
import { BookingSoService } from './booking-so.service.js';
import { BookingsController } from './bookings.controller.js';
import { BookingsService } from './bookings.service.js';
import { DocumentStorageService } from './document-storage.service.js';
import { DocumentsController } from './documents.controller.js';
import { DocumentsService } from './documents.service.js';
import { ShipmentsController } from './shipments.controller.js';
import { ShipmentsService } from './shipments.service.js';
import { ShipmentStateMachine } from './shipment-state-machine.js';

@Module({
  controllers: [
    BookingsController,
    AdminBookingsController,
    DocumentsController,
    ShipmentsController,
    AdminBookingSoController,
    CustomerBookingSoController,
  ],
  providers: [
    BookingsService,
    BookingStateMachine,
    DocumentStorageService,
    DocumentsService,
    ShipmentsService,
    ShipmentStateMachine,
    BookingSoService,
  ],
  exports: [DocumentStorageService],
})
export class BookingsModule {}
