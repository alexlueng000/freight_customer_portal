import { Controller, Get, Param } from '@nestjs/common';
import { ApiBearerAuth, ApiForbiddenResponse, ApiNotFoundResponse, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { RequirePermissions } from '../auth/permissions.decorator.js';
import { RateImportsService } from './rate-imports.service.js';

@ApiTags('rate-imports')
@ApiBearerAuth()
@Controller({ path: 'rate-imports', version: '1' })
export class RateImportsController {
  constructor(private readonly imports: RateImportsService) {}

  @Get(':id')
  @RequirePermissions('rate.manage')
  @ApiOkResponse({ description: 'Tenant-scoped rate import status and row errors' })
  @ApiNotFoundResponse({ description: 'Import job not found in caller tenant' })
  @ApiForbiddenResponse({ description: 'Missing rate.manage permission' })
  getById(@Param('id') id: string) {
    return this.imports.getById(id);
  }
}
