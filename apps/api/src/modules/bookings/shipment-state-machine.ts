import { BadRequestException, Injectable } from '@nestjs/common';
import { ShipmentStatus } from '@prisma/client';

const transitions: Record<ShipmentStatus, readonly ShipmentStatus[]> = {
  CREATED: [ShipmentStatus.BOOKED, ShipmentStatus.CANCELLED],
  BOOKED: [ShipmentStatus.DEPARTED, ShipmentStatus.CANCELLED],
  DEPARTED: [ShipmentStatus.IN_TRANSIT, ShipmentStatus.ARRIVED, ShipmentStatus.CANCELLED],
  IN_TRANSIT: [ShipmentStatus.ARRIVED, ShipmentStatus.CANCELLED],
  ARRIVED: [ShipmentStatus.COMPLETED, ShipmentStatus.CANCELLED],
  COMPLETED: [],
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
