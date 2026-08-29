import { QuoteStatus } from '@prisma/client';

const transitions: Readonly<Record<QuoteStatus, readonly QuoteStatus[]>> = {
  DRAFT: [QuoteStatus.SENT, QuoteStatus.EXPIRED, QuoteStatus.CANCELLED],
  SENT: [
    QuoteStatus.VIEWED,
    QuoteStatus.ACCEPTED,
    QuoteStatus.REJECTED,
    QuoteStatus.EXPIRED,
    QuoteStatus.CANCELLED,
  ],
  VIEWED: [QuoteStatus.ACCEPTED, QuoteStatus.REJECTED, QuoteStatus.EXPIRED, QuoteStatus.CANCELLED],
  ACCEPTED: [QuoteStatus.BOOKED, QuoteStatus.CANCELLED],
  BOOKED: [],
  EXPIRED: [],
  REJECTED: [],
  CANCELLED: [],
};

export class QuoteStateMachine {
  canTransition(from: QuoteStatus, to: QuoteStatus) {
    return transitions[from].includes(to);
  }
  allowedTransitions(from: QuoteStatus) {
    return transitions[from];
  }
}
