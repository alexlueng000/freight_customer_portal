import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiConsumes, ApiTags } from '@nestjs/swagger';
import { RequirePermissions } from '../auth/permissions.decorator.js';
import { BookingsService } from './bookings.service.js';
import { BookingActionDto } from './dto/booking-action.dto.js';
import { CreateShipmentDto } from './dto/create-shipment.dto.js';
import { ListBookingsDto } from './dto/list-bookings.dto.js';

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
  @Post(':id/review') @RequirePermissions('booking.manage') review(
    @Param('id') id: string,
    @Body() dto: BookingActionDto,
  ) {
    return this.bookings.review(id, dto);
  }
  @Post(':id/confirm') @RequirePermissions('booking.manage') confirm(
    @Param('id') id: string,
    @Body() dto: BookingActionDto,
  ) {
    return this.bookings.confirm(id, dto);
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
  @Post(':id/release-so')
  @RequirePermissions('document.upload')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 10 * 1024 * 1024, files: 1 } }))
  @ApiConsumes('multipart/form-data')
  releaseSo(@Param('id') id: string, @UploadedFile() file: Express.Multer.File | undefined) {
    return this.bookings.releaseSo(id, file);
  }
  @Post(':id/shipments')
  @RequirePermissions('shipment.create')
  createShipment(@Param('id') id: string, @Body() dto: CreateShipmentDto) {
    return this.bookings.createShipment(id, dto);
  }
}
