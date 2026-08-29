import { BookingStatus } from '@prisma/client';
import { BookingStateMachine } from './booking-state-machine.js';

describe('BookingStateMachine', () => {
  const machine = new BookingStateMachine();
  it('allows the approved happy path', () => {
    expect(machine.canTransition(BookingStatus.DRAFT, BookingStatus.SUBMITTED)).toBe(true);
    expect(machine.canTransition(BookingStatus.SUBMITTED, BookingStatus.UNDER_REVIEW)).toBe(true);
    expect(machine.canTransition(BookingStatus.UNDER_REVIEW, BookingStatus.CONFIRMED)).toBe(true);
    expect(machine.canTransition(BookingStatus.CONFIRMED, BookingStatus.SO_RELEASED)).toBe(true);
  });
  it('allows only the approved cancellation and rejection branches', () => {
    expect(machine.canTransition(BookingStatus.DRAFT, BookingStatus.CANCELLED)).toBe(true);
    expect(machine.canTransition(BookingStatus.SUBMITTED, BookingStatus.CANCELLED)).toBe(true);
    expect(machine.canTransition(BookingStatus.UNDER_REVIEW, BookingStatus.REJECTED)).toBe(true);
    expect(machine.canTransition(BookingStatus.CONFIRMED, BookingStatus.CANCELLED)).toBe(true);
    expect(machine.canTransition(BookingStatus.DRAFT, BookingStatus.REJECTED)).toBe(false);
    expect(machine.canTransition(BookingStatus.SUBMITTED, BookingStatus.CONFIRMED)).toBe(false);
  });
  it('rejects illegal jumps and terminal transitions', () => {
    expect(machine.canTransition(BookingStatus.DRAFT, BookingStatus.CONFIRMED)).toBe(false);
    expect(machine.allowedTransitions(BookingStatus.REJECTED)).toEqual([]);
  });
});
