import { BadRequestException, Injectable } from '@nestjs/common';
import { ShipmentStatus } from '@prisma/client';

const transitions: Record<ShipmentStatus, readonly ShipmentStatus[]> = {
  PLANNED: [ShipmentStatus.DEPARTED, ShipmentStatus.CANCELLED],
  DEPARTED: [ShipmentStatus.ARRIVED, ShipmentStatus.CANCELLED],
  ARRIVED: [],
  CANCELLED: [],
};

@Injectable()
export class ShipmentStateMachine {
  assertTransition(from: ShipmentStatus, to: ShipmentStatus) {
    if (!transitions[from].includes(to))
      throw new BadRequestException({
        code: 'ILLEGAL_SHIPMENT_TRANSITION',
        message: `Shipment cannot transition from ${from} to ${to}`,
      });
  }
}
