import { BookingStatus } from '@prisma/client';

const transitions: Readonly<Record<BookingStatus, readonly BookingStatus[]>> = {
  DRAFT: [BookingStatus.SUBMITTED, BookingStatus.CANCELLED],
  SUBMITTED: [BookingStatus.UNDER_REVIEW, BookingStatus.CANCELLED],
  UNDER_REVIEW: [BookingStatus.CONFIRMED, BookingStatus.REJECTED, BookingStatus.CANCELLED],
  CONFIRMED: [BookingStatus.SO_RELEASED, BookingStatus.CANCELLED],
  SO_RELEASED: [],
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
