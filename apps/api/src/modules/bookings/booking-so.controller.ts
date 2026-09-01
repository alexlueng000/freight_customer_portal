import { Body, Controller, Get, Param, Post, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiConsumes, ApiTags } from '@nestjs/swagger';
import { RequirePermissions } from '../auth/permissions.decorator.js';
import { BookingSoService } from './booking-so.service.js';
import { CreateBookingSoRecordDto } from './dto/create-booking-so-record.dto.js';

@ApiTags('admin-booking-so')
@ApiBearerAuth()
@Controller({ path: 'admin/bookings', version: '1' })
export class AdminBookingSoController {
  constructor(private readonly bookingSo: BookingSoService) {}

  @Get(':id/so-records')
  @RequirePermissions('document.read')
  list(@Param('id') id: string) {
    return this.bookingSo.listInternal(id);
  }

  @Post(':id/so-records')
  @RequirePermissions('document.upload')
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 10 * 1024 * 1024, files: 1 } }))
  create(
    @Param('id') id: string,
    @Body() dto: CreateBookingSoRecordDto,
    @UploadedFile() file: Express.Multer.File | undefined,
  ) {
    return this.bookingSo.create(id, dto, file);
  }

  @Post(':id/so-records/:soId/replace')
  @RequirePermissions('document.upload')
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 10 * 1024 * 1024, files: 1 } }))
  replace(
    @Param('id') id: string,
    @Param('soId') soId: string,
    @Body() dto: CreateBookingSoRecordDto,
    @UploadedFile() file: Express.Multer.File | undefined,
  ) {
    return this.bookingSo.replace(id, soId, dto, file);
  }

  @Post(':id/so-records/:soId/publish')
  @RequirePermissions('document.manage')
  publish(@Param('id') id: string, @Param('soId') soId: string) {
    return this.bookingSo.publish(id, soId);
  }
}

@ApiTags('booking-so')
@ApiBearerAuth()
@Controller({ path: 'bookings', version: '1' })
export class CustomerBookingSoController {
  constructor(private readonly bookingSo: BookingSoService) {}

  @Get(':id/so-records')
  @RequirePermissions('document.read')
  list(@Param('id') id: string) {
    return this.bookingSo.listCustomer(id);
  }
}
