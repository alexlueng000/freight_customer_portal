import { Body, Controller, Get, Patch } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { RequirePermissions } from '../auth/permissions.decorator.js';
import { QuotesService } from './quotes.service.js';
import { QuoteApprovalSettingsDto } from './dto/quote-approval.dto.js';

@ApiTags('quote-settings') @ApiBearerAuth()
@Controller({ path: 'admin/quote-settings', version: '1' })
export class QuoteSettingsController {
  constructor(private readonly quotes: QuotesService) {}
  @Get() @RequirePermissions('quote.manage')
  @ApiOkResponse({ description: 'Current tenant quote approval setting' })
  get() { return this.quotes.approvalSettings(); }
  @Patch() @RequirePermissions('quote.manage')
  @ApiOkResponse({ description: 'Tenant administrator sets approval requirement; pending reviews must be resolved before disabling' })
  update(@Body() dto: QuoteApprovalSettingsDto) { return this.quotes.updateApprovalSettings(dto.quoteApprovalRequired); }
}
