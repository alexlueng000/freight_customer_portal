import { BookingStatus } from '@prisma/client';

const transitions: Readonly<Record<BookingStatus, readonly BookingStatus[]>> = {
  DRAFT: [BookingStatus.SUBMITTED, BookingStatus.CANCELLED],
  SUBMITTED: [
    BookingStatus.APPROVED,
    BookingStatus.REVISION_REQUIRED,
    BookingStatus.REJECTED,
    BookingStatus.CANCELLED,
  ],
  REVISION_REQUIRED: [BookingStatus.SUBMITTED, BookingStatus.CANCELLED],
  APPROVED: [BookingStatus.BOOKING_SUBMITTED, BookingStatus.REJECTED, BookingStatus.CANCELLED],
  BOOKING_SUBMITTED: [BookingStatus.BOOKED, BookingStatus.REJECTED, BookingStatus.CANCELLED],
  BOOKED: [],
  REJECTED: [],
  CANCELLED: [],
};

export class BookingStateMachine {
  canTransition(from: BookingStatus, to: BookingStatus) {
    return transitions[from].includes(to);
  }
  allowedTransitions(from: BookingStatus) {
    return transitions[from];
  }
}
