import { Controller, Get, Param, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { RequirePermissions } from '../auth/permissions.decorator.js';
import { ListInvoicesDto } from './dto/list-invoices.dto.js';
import { InvoicesService } from './invoices.service.js';

@ApiTags('invoices')
@ApiBearerAuth()
@Controller({ path: 'invoices', version: '1' })
export class InvoicesController {
  constructor(private readonly invoices: InvoicesService) {}
  @Get() @RequirePermissions('invoice.read') list(@Query() query: ListInvoicesDto) {
    return this.invoices.list(query);
  }
  @Get(':id') @RequirePermissions('invoice.read') get(@Param('id') id: string) {
    return this.invoices.get(id);
  }
  @Post(':id/confirm') @RequirePermissions('invoice.confirm') confirm(@Param('id') id: string) {
    return this.invoices.confirm(id);
  }
}
