import { Controller, Get, Param, Res } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { RequirePermissions } from '../auth/permissions.decorator.js';
import { DocumentsService } from './documents.service.js';

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
