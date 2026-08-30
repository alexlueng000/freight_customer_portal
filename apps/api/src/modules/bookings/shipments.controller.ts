import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { ShipmentStatus } from '@prisma/client';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { RequirePermissions } from '../auth/permissions.decorator.js';
import { ShipmentsService } from './shipments.service.js';
import { CreateContainerDto } from './dto/create-container.dto.js';
import { CreateTrackingEventDto } from './dto/create-tracking-event.dto.js';
import { ShipmentActionDto } from './dto/shipment-action.dto.js';
import { UpdateShipmentDto } from './dto/update-shipment.dto.js';

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

  @Patch(':id')
  @RequirePermissions('shipment.manage')
  update(@Param('id') id: string, @Body() dto: UpdateShipmentDto) {
    return this.shipments.update(id, dto);
  }

  @Post(':id/containers')
  @RequirePermissions('shipment.manage')
  addContainer(@Param('id') id: string, @Body() dto: CreateContainerDto) {
    return this.shipments.addContainer(id, dto);
  }

  @Post(':id/events')
  @RequirePermissions('tracking.manage')
  addEvent(@Param('id') id: string, @Body() dto: CreateTrackingEventDto) {
    return this.shipments.addEvent(id, dto);
  }

  @Post(':id/start')
  @RequirePermissions('shipment.manage')
  start(@Param('id') id: string, @Body() dto: ShipmentActionDto) {
    return this.shipments.transition(id, ShipmentStatus.IN_PROGRESS, dto);
  }
  @Post(':id/depart')
  @RequirePermissions('shipment.manage')
  depart(@Param('id') id: string, @Body() dto: ShipmentActionDto) {
    return this.shipments.transition(id, ShipmentStatus.DEPARTED, dto);
  }
  @Post(':id/arrive')
  @RequirePermissions('shipment.manage')
  arrive(@Param('id') id: string, @Body() dto: ShipmentActionDto) {
    return this.shipments.transition(id, ShipmentStatus.ARRIVED, dto);
  }
  @Post(':id/complete')
  @RequirePermissions('shipment.manage')
  complete(@Param('id') id: string, @Body() dto: ShipmentActionDto) {
    return this.shipments.transition(id, ShipmentStatus.COMPLETED, dto);
  }
  @Post(':id/cancel')
  @RequirePermissions('shipment.manage')
  cancel(@Param('id') id: string, @Body() dto: ShipmentActionDto) {
    return this.shipments.transition(id, ShipmentStatus.CANCELLED, dto);
  }
}
