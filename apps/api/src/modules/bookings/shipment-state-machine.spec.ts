import { ShipmentStatus } from '@prisma/client';
import { ShipmentStateMachine } from './shipment-state-machine.js';

describe('ShipmentStateMachine', () => {
  const machine = new ShipmentStateMachine();
  it('allows the approved lifecycle', () => {
    expect(() =>
      machine.assertTransition(ShipmentStatus.PLANNED, ShipmentStatus.IN_PROGRESS),
    ).not.toThrow();
    expect(() =>
      machine.assertTransition(ShipmentStatus.DEPARTED, ShipmentStatus.ARRIVED),
    ).not.toThrow();
  });
  it('rejects skipped and terminal transitions', () => {
    expect(() =>
      machine.assertTransition(ShipmentStatus.PLANNED, ShipmentStatus.ARRIVED),
    ).toThrow();
    expect(() =>
      machine.assertTransition(ShipmentStatus.COMPLETED, ShipmentStatus.IN_PROGRESS),
    ).toThrow();
  });
});
