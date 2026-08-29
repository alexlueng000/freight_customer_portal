import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiForbiddenResponse, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { RequirePermissions } from '../auth/permissions.decorator.js';
import { CustomerRatesService } from './customer-rates.service.js';
import { SearchCustomerRatesDto } from './dto/search-customer-rates.dto.js';

@ApiTags('portal-rates')
@ApiBearerAuth()
@Controller({ path: 'portal/rates', version: '1' })
export class CustomerRatesController {
  constructor(private readonly rates: CustomerRatesService) {}
  @Get()
  @RequirePermissions('rate.search')
  @ApiOkResponse({ description: 'Customer-scoped active rates with final sell prices only' })
  @ApiForbiddenResponse({ description: 'Missing rate.search permission or inactive customer company' })
  search(@Query() query: SearchCustomerRatesDto) { return this.rates.search(query); }
}
