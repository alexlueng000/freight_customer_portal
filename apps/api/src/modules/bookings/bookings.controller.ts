import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiCreatedResponse, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { RequirePermissions } from '../auth/permissions.decorator.js';
import { BookingsService } from './bookings.service.js';
import { BookingActionDto } from './dto/booking-action.dto.js';
import { CreateBookingDto } from './dto/create-booking.dto.js';
import { ListBookingsDto } from './dto/list-bookings.dto.js';
import { UpdateBookingDto } from './dto/update-booking.dto.js';

@ApiTags('bookings')
@ApiBearerAuth()
@Controller({ path: 'bookings', version: '1' })
export class BookingsController {
  constructor(private readonly bookings: BookingsService) {}
  @Post()
  @RequirePermissions('booking.create')
  @ApiCreatedResponse({ description: 'Create a draft booking from an accepted quote' })
  create(@Body() dto: CreateBookingDto) {
    return this.bookings.create(dto);
  }
  @Get() @RequirePermissions('booking.read') list(@Query() query: ListBookingsDto) {
    return this.bookings.list(query);
  }
  @Get(':id') @RequirePermissions('booking.read') get(@Param('id') id: string) {
    return this.bookings.get(id);
  }
  @Patch(':id') @RequirePermissions('booking.create') update(
    @Param('id') id: string,
    @Body() dto: UpdateBookingDto,
  ) {
    return this.bookings.update(id, dto);
  }
  @Post(':id/submit')
  @RequirePermissions('booking.submit')
  @ApiOkResponse({ description: 'Submit a complete draft booking' })
  submit(@Param('id') id: string) {
    return this.bookings.submit(id);
  }
  @Post(':id/cancel') @RequirePermissions('booking.submit') cancel(
    @Param('id') id: string,
    @Body() dto: BookingActionDto,
  ) {
    return this.bookings.cancel(id, dto);
  }
}
