import { ShipmentStatus } from '@prisma/client';
import { ShipmentStateMachine } from './shipment-state-machine.js';

describe('ShipmentStateMachine', () => {
  const machine = new ShipmentStateMachine();
  it('allows the approved lifecycle', () => {
    expect(() =>
      machine.assertTransition(ShipmentStatus.CREATED, ShipmentStatus.BOOKED),
    ).not.toThrow();
    expect(() =>
      machine.assertTransition(ShipmentStatus.BOOKED, ShipmentStatus.DEPARTED),
    ).not.toThrow();
    expect(() =>
      machine.assertTransition(ShipmentStatus.DEPARTED, ShipmentStatus.IN_TRANSIT),
    ).not.toThrow();
    expect(() =>
      machine.assertTransition(ShipmentStatus.DEPARTED, ShipmentStatus.ARRIVED),
    ).not.toThrow();
  });
  it('rejects skipped and terminal transitions', () => {
    expect(() =>
      machine.assertTransition(ShipmentStatus.CREATED, ShipmentStatus.ARRIVED),
    ).toThrow();
    expect(() =>
      machine.assertTransition(ShipmentStatus.COMPLETED, ShipmentStatus.BOOKED),
    ).toThrow();
  });
});
