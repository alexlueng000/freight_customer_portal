import { Body, Controller, Get, Param, Patch, Post, Query, Res } from '@nestjs/common';
import type { Response } from 'express';
import { ApiBearerAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { RequirePermissions } from '../auth/permissions.decorator.js';
import { ListQuotesDto } from './dto/list-quotes.dto.js';
import { QuotesService } from './quotes.service.js';
import { OverrideQuotePricesDto } from './dto/override-quote-prices.dto.js';
import { QuotePdfQueueService } from './quote-pdf-queue.service.js';

@ApiTags('admin-quotes')
@ApiBearerAuth()
@Controller({ path: 'admin/quotes', version: '1' })
export class AdminQuotesController {
  constructor(
    private readonly quotes: QuotesService,
    private readonly pdf: QuotePdfQueueService,
  ) {}
  @Get()
  @RequirePermissions('quote.manage')
  @ApiOkResponse({
    description: 'Tenant-scoped quote list; Sales is limited to assigned customers',
  })
  list(@Query() query: ListQuotesDto) {
    return this.quotes.listInternal(query);
  }
  @Get(':id')
  @RequirePermissions('quote.manage')
  @ApiOkResponse({ description: 'Tenant-scoped quote detail' })
  get(@Param('id') id: string) {
    return this.quotes.getInternal(id);
  }
  @Post(':id/send')
  @RequirePermissions('quote.manage')
  @ApiOkResponse({ description: 'Send a draft quote to its customer' })
  send(@Param('id') id: string) {
    return this.quotes.send(id);
  }
  @Post(':id/expire')
  @RequirePermissions('quote.manage')
  @ApiOkResponse({ description: 'Expire an open quote' })
  expire(@Param('id') id: string) {
    return this.quotes.expire(id);
  }
  @Patch(':id/prices')
  @RequirePermissions('quote.manage')
  @ApiOkResponse({ description: 'Override draft quote item prices with a mandatory reason' })
  overridePrices(@Param('id') id: string, @Body() dto: OverrideQuotePricesDto) {
    return this.quotes.overridePrices(id, dto);
  }
  @Get(':id/pdf')
  @RequirePermissions('quote.manage')
  async downloadPdf(@Param('id') id: string, @Res() response: Response) {
    const jobData = await this.quotes.getPdfJobData(id, true);
    const buffer = await this.pdf.getOrGenerate(jobData);
    response.setHeader('Content-Type', 'application/pdf');
    response.setHeader(
      'Content-Disposition',
      `attachment; filename="${jobData.quote.quoteNo}-v${jobData.version}.pdf"`,
    );
    response.send(buffer);
  }
}
