import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { RequirePermissions } from '../auth/permissions.decorator.js';
import { CreateInvoiceDto } from './dto/create-invoice.dto.js';
import { ListInvoicesDto } from './dto/list-invoices.dto.js';
import { InvoicesService } from './invoices.service.js';

@ApiTags('admin-invoices')
@ApiBearerAuth()
@Controller({ path: 'admin/invoices', version: '1' })
export class AdminInvoicesController {
  constructor(private readonly invoices: InvoicesService) {}
  @Get() @RequirePermissions('invoice.read') list(@Query() query: ListInvoicesDto) {
    return this.invoices.list(query);
  }
  @Get(':id') @RequirePermissions('invoice.read') get(@Param('id') id: string) {
    return this.invoices.get(id);
  }
  @Post() @RequirePermissions('invoice.manage') create(@Body() dto: CreateInvoiceDto) {
    return this.invoices.create(dto);
  }
  @Post(':id/issue') @RequirePermissions('invoice.manage') issue(@Param('id') id: string) {
    return this.invoices.issue(id);
  }
  @Post(':id/mark-paid') @RequirePermissions('invoice.manage') markPaid(@Param('id') id: string) {
    return this.invoices.markPaid(id);
  }
  @Post(':id/void') @RequirePermissions('invoice.manage') void(@Param('id') id: string) {
    return this.invoices.void(id);
  }
}
