import { Body, Controller, Get, Param, Patch, Post, Query, Res, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiBody, ApiConflictResponse, ApiConsumes, ApiCreatedResponse, ApiForbiddenResponse, ApiNotFoundResponse, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { RequirePermissions } from '../auth/permissions.decorator.js';
import { CreateRateDto } from './dto/create-rate.dto.js';
import { ListRatesDto } from './dto/list-rates.dto.js';
import { UpdateRateDto } from './dto/update-rate.dto.js';
import { RatesService } from './rates.service.js';
import { RateImportsService } from './rate-imports.service.js';
import { ConfirmRateImportDto } from './dto/confirm-rate-import.dto.js';
@ApiTags('rates') @ApiBearerAuth() @Controller({ path: 'rates', version: '1' })
export class RatesController {
  constructor(private readonly rates: RatesService, private readonly imports: RateImportsService) {}
  @Get() @RequirePermissions('rate.read') @ApiOkResponse({ description: 'Tenant-scoped rate list for internal administration' }) @ApiForbiddenResponse({ description: 'Missing rate.read permission' }) list(@Query() query: ListRatesDto) { return this.rates.list(query); }
  @Post() @RequirePermissions('rate.manage') @ApiCreatedResponse({ description: 'Rate created with prices and charges' }) @ApiConflictResponse({ description: 'Rate number exists in tenant' }) create(@Body() dto: CreateRateDto) { return this.rates.create(dto); }
  @Post('import')
  @RequirePermissions('rate.manage')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 5 * 1024 * 1024, files: 1 } }))
  @ApiConsumes('multipart/form-data')
  @ApiBody({ schema: { type: 'object', required: ['file'], properties: { file: { type: 'string', format: 'binary' } } } })
  @ApiCreatedResponse({ description: 'Asynchronous rate import accepted' })
  importRates(@UploadedFile() file: Express.Multer.File | undefined) { return this.imports.create(file); }
  @Post('import/analyze')
  @RequirePermissions('rate.manage')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 5 * 1024 * 1024, files: 1 } }))
  @ApiConsumes('multipart/form-data')
  @ApiBody({ schema: { type: 'object', required: ['file'], properties: { file: { type: 'string', format: 'binary' } } } })
  @ApiOkResponse({ description: 'Analyze sheets, header candidates and mapping suggestions without writing rate data' })
  analyzeImport(@UploadedFile() file: Express.Multer.File | undefined) { return this.imports.analyze(file); }
  @Post('import/preview')
  @RequirePermissions('rate.manage')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 5 * 1024 * 1024, files: 1 } }))
  @ApiConsumes('multipart/form-data')
  @ApiBody({ schema: { type: 'object', required: ['file', 'configuration'], properties: { file: { type: 'string', format: 'binary' }, configuration: { type: 'string', description: 'JSON containing sheetName, headerRow, headerDepth and mappings' } } } })
  @ApiOkResponse({ description: 'Normalize mapped workbook rows and return preview errors/warnings without writing data' })
  previewImport(@UploadedFile() file: Express.Multer.File | undefined, @Body('configuration') configuration?: string) { return this.imports.preview(file, configuration); }
  @Post('import/confirm')
  @RequirePermissions('rate.manage')
  @ApiCreatedResponse({ description: 'Validate and enqueue a tenant/user-bound normalized preview exactly once' })
  confirmImport(@Body() dto: ConfirmRateImportDto) { return this.imports.confirmPreview(dto); }
  @Get('import-template')
  @RequirePermissions('rate.manage')
  async importTemplate(@Res() response: Response) {
    const buffer = await this.imports.template();
    response.setHeader('content-type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    response.setHeader('content-disposition', 'attachment; filename="rate-import-template.xlsx"');
    response.send(buffer);
  }
  @Get(':id') @RequirePermissions('rate.read') @ApiOkResponse({ description: 'Tenant-scoped rate detail' }) @ApiNotFoundResponse({ description: 'Rate not found in caller tenant' }) get(@Param('id') id: string) { return this.rates.getById(id); }
  @Patch(':id') @RequirePermissions('rate.manage') @ApiOkResponse({ description: 'Rate and optional price/charge sets updated' }) update(@Param('id') id: string, @Body() dto: UpdateRateDto) { return this.rates.update(id, dto); }
}
