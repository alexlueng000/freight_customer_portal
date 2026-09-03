import { Body, Controller, Get, Param, Post, Query, Res } from '@nestjs/common';
import type { Response } from 'express';
import { ApiBearerAuth, ApiCreatedResponse, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { RequirePermissions } from '../auth/permissions.decorator.js';
import { CreateQuoteDto } from './dto/create-quote.dto.js';
import { ListQuotesDto } from './dto/list-quotes.dto.js';
import { RejectQuoteDto } from './dto/reject-quote.dto.js';
import { QuotesService } from './quotes.service.js';
import { QuotePdfQueueService } from './quote-pdf-queue.service.js';

@ApiTags('quotes')
@ApiBearerAuth()
@Controller({ path: 'quotes', version: '1' })
export class QuotesController {
  constructor(
    private readonly quotes: QuotesService,
    private readonly pdf: QuotePdfQueueService,
  ) {}
  @Post()
  @RequirePermissions('quote.create')
  @ApiCreatedResponse({ description: 'Customer quote created from an active rate snapshot' })
  create(@Body() dto: CreateQuoteDto) {
    return this.quotes.create(dto);
  }
  @Get()
  @RequirePermissions('quote.read')
  @ApiOkResponse({ description: 'Customer-scoped quote list' })
  list(@Query() query: ListQuotesDto) {
    return this.quotes.list(query);
  }
  @Get(':id/pdf')
  @RequirePermissions('quote.read')
  async downloadPdf(@Param('id') id: string, @Res() response: Response) {
    const jobData = await this.quotes.getPdfJobData(id, false);
    const buffer = await this.pdf.getOrGenerate(jobData);
    response.setHeader('Content-Type', 'application/pdf');
    response.setHeader(
      'Content-Disposition',
      `attachment; filename="${jobData.quote.quoteNo}-v${jobData.version}.pdf"`,
    );
    response.send(buffer);
  }
  @Get(':id')
  @RequirePermissions('quote.read')
  @ApiOkResponse({ description: 'Customer-scoped quote detail without cost fields' })
  get(@Param('id') id: string) {
    return this.quotes.get(id);
  }
  @Post(':id/accept')
  @RequirePermissions('quote.accept')
  @ApiOkResponse({ description: 'Accept a sent or viewed, non-expired customer quote' })
  accept(@Param('id') id: string) {
    return this.quotes.accept(id);
  }
  @Post(':id/reject')
  @RequirePermissions('quote.reject')
  @ApiOkResponse({ description: 'Reject a sent or viewed, non-expired customer quote' })
  reject(@Param('id') id: string, @Body() dto: RejectQuoteDto) {
    return this.quotes.reject(id, dto);
  }
}
