import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Res,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiConsumes, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { RequirePermissions } from '../auth/permissions.decorator.js';
import { DocumentsService } from './documents.service.js';
import { UploadShipmentDocumentDto } from './dto/upload-shipment-document.dto.js';

@ApiTags('documents')
@ApiBearerAuth()
@Controller({ version: '1' })
export class DocumentsController {
  constructor(private readonly documents: DocumentsService) {}

  @Get('bookings/:id/documents')
  @RequirePermissions('document.read')
  listForBooking(@Param('id') id: string) {
    return this.documents.listForBooking(id);
  }

  @Get('shipments/:id/documents')
  @RequirePermissions('document.read')
  listForShipment(@Param('id') id: string) {
    return this.documents.listForShipment(id);
  }

  @Get('invoices/:id/documents')
  @RequirePermissions('invoice.read')
  listForInvoice(@Param('id') id: string) {
    return this.documents.listForInvoice(id);
  }

  @Post('admin/invoices/:id/documents')
  @RequirePermissions('invoice.manage')
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 10 * 1024 * 1024, files: 1 } }))
  uploadForInvoice(
    @Param('id') id: string,
    @UploadedFile() file: Express.Multer.File | undefined,
  ) {
    return this.documents.uploadForInvoice(id, file);
  }

  @Post('shipments/:id/documents')
  @RequirePermissions('document.manage')
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 10 * 1024 * 1024, files: 1 } }))
  uploadForShipment(
    @Param('id') id: string,
    @Body() dto: UploadShipmentDocumentDto,
    @UploadedFile() file: Express.Multer.File | undefined,
  ) {
    return this.documents.uploadForShipment(id, dto, file);
  }

  @Get('documents/:id/download')
  @RequirePermissions('document.read')
  async download(@Param('id') id: string, @Res() response: Response) {
    const { document, buffer } = await this.documents.download(id);
    const filename = document.originalFilename.replace(/[\r\n"\\]/g, '_');
    response.setHeader('content-type', document.mimeType);
    response.setHeader(
      'content-disposition',
      `attachment; filename="${filename}"; filename*=UTF-8''${encodeURIComponent(filename)}`,
    );
    response.setHeader('content-length', buffer.length);
    response.send(buffer);
  }
}
