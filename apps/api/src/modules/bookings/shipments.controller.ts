import { Controller, Get, Param } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { RequirePermissions } from '../auth/permissions.decorator.js';
import { ShipmentsService } from './shipments.service.js';

@ApiTags('shipments')
@ApiBearerAuth()
@Controller({ path: 'shipments', version: '1' })
export class ShipmentsController {
  constructor(private readonly shipments: ShipmentsService) {}

  @Get()
  @RequirePermissions('shipment.read')
  list() {
    return this.shipments.list();
  }

  @Get(':id')
  @RequirePermissions('shipment.read')
  get(@Param('id') id: string) {
    return this.shipments.get(id);
  }
}
