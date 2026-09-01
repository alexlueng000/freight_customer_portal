import { BookingStatus } from '@prisma/client';
import { BookingStateMachine } from './booking-state-machine.js';

describe('BookingStateMachine', () => {
  const machine = new BookingStateMachine();
  it('allows the approved happy path', () => {
    expect(machine.canTransition(BookingStatus.DRAFT, BookingStatus.SUBMITTED)).toBe(true);
    expect(machine.canTransition(BookingStatus.SUBMITTED, BookingStatus.APPROVED)).toBe(true);
    expect(machine.canTransition(BookingStatus.APPROVED, BookingStatus.BOOKING_SUBMITTED)).toBe(
      true,
    );
    expect(machine.canTransition(BookingStatus.BOOKING_SUBMITTED, BookingStatus.BOOKED)).toBe(true);
  });
  it('allows only the approved cancellation and rejection branches', () => {
    expect(machine.canTransition(BookingStatus.DRAFT, BookingStatus.CANCELLED)).toBe(true);
    expect(machine.canTransition(BookingStatus.SUBMITTED, BookingStatus.CANCELLED)).toBe(true);
    expect(machine.canTransition(BookingStatus.SUBMITTED, BookingStatus.REVISION_REQUIRED)).toBe(
      true,
    );
    expect(machine.canTransition(BookingStatus.REVISION_REQUIRED, BookingStatus.SUBMITTED)).toBe(
      true,
    );
    expect(machine.canTransition(BookingStatus.APPROVED, BookingStatus.REJECTED)).toBe(true);
    expect(machine.canTransition(BookingStatus.BOOKING_SUBMITTED, BookingStatus.CANCELLED)).toBe(
      true,
    );
    expect(machine.canTransition(BookingStatus.DRAFT, BookingStatus.REJECTED)).toBe(false);
    expect(machine.canTransition(BookingStatus.SUBMITTED, BookingStatus.BOOKING_SUBMITTED)).toBe(
      false,
    );
  });
  it('rejects illegal jumps and terminal transitions', () => {
    expect(machine.canTransition(BookingStatus.DRAFT, BookingStatus.APPROVED)).toBe(false);
    expect(machine.allowedTransitions(BookingStatus.REJECTED)).toEqual([]);
  });
});
