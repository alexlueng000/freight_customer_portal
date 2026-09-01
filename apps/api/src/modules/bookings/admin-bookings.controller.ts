import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { RequirePermissions } from '../auth/permissions.decorator.js';
import { BookingsService } from './bookings.service.js';
import { BookingActionDto } from './dto/booking-action.dto.js';
import { CreateShipmentDto } from './dto/create-shipment.dto.js';
import { ListBookingsDto } from './dto/list-bookings.dto.js';
import { RequestBookingRevisionDto } from './dto/request-booking-revision.dto.js';
import { SubmitBookingToCarrierDto } from './dto/submit-booking-to-carrier.dto.js';

@ApiTags('admin-bookings')
@ApiBearerAuth()
@Controller({ path: 'admin/bookings', version: '1' })
export class AdminBookingsController {
  constructor(private readonly bookings: BookingsService) {}
  @Get() @RequirePermissions('booking.read') list(@Query() query: ListBookingsDto) {
    return this.bookings.listInternal(query);
  }
  @Get(':id') @RequirePermissions('booking.read') get(@Param('id') id: string) {
    return this.bookings.getInternal(id);
  }
  @Post(':id/approve') @RequirePermissions('booking.manage') approve(
    @Param('id') id: string,
    @Body() dto: BookingActionDto,
  ) {
    return this.bookings.approve(id, dto);
  }
  @Post(':id/request-revision') @RequirePermissions('booking.manage') requestRevision(
    @Param('id') id: string,
    @Body() dto: RequestBookingRevisionDto,
  ) {
    return this.bookings.requestRevision(id, dto);
  }
  @Post(':id/submit-to-carrier') @RequirePermissions('booking.manage') submitToCarrier(
    @Param('id') id: string,
    @Body() dto: SubmitBookingToCarrierDto,
  ) {
    return this.bookings.submitToCarrier(id, dto);
  }
  @Post(':id/reject') @RequirePermissions('booking.manage') reject(
    @Param('id') id: string,
    @Body() dto: BookingActionDto,
  ) {
    return this.bookings.reject(id, dto);
  }
  @Post(':id/cancel') @RequirePermissions('booking.manage') cancel(
    @Param('id') id: string,
    @Body() dto: BookingActionDto,
  ) {
    return this.bookings.cancelInternal(id, dto);
  }
  @Post(':id/shipments')
  @RequirePermissions('shipment.create')
  createShipment(@Param('id') id: string, @Body() dto: CreateShipmentDto) {
    return this.bookings.createShipment(id, dto);
  }
}
