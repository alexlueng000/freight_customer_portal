import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiForbiddenResponse, ApiNotFoundResponse, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { RequirePermissions } from '../auth/permissions.decorator.js';
import { RateImportsService } from './rate-imports.service.js';
import { CreateRateImportMappingProfileDto } from './dto/create-rate-import-mapping-profile.dto.js';

@ApiTags('rate-imports')
@ApiBearerAuth()
@Controller({ path: 'rate-imports', version: '1' })
export class RateImportsController {
  constructor(private readonly imports: RateImportsService) {}

  @Get('mapping-profiles')
  @RequirePermissions('rate.manage')
  @ApiOkResponse({ description: 'Tenant-scoped reusable rate import mapping profiles' })
  listMappingProfiles() {
    return this.imports.listMappingProfiles();
  }

  @Post('mapping-profiles')
  @RequirePermissions('rate.manage')
  createMappingProfile(@Body() dto: CreateRateImportMappingProfileDto) {
    return this.imports.createMappingProfile(dto);
  }

  @Get(':id')
  @RequirePermissions('rate.manage')
  @ApiOkResponse({ description: 'Tenant-scoped rate import status and row errors' })
  @ApiNotFoundResponse({ description: 'Import job not found in caller tenant' })
  @ApiForbiddenResponse({ description: 'Missing rate.manage permission' })
  getById(@Param('id') id: string) {
    return this.imports.getById(id);
  }
}
