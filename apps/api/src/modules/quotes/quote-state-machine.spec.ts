import { QuoteStatus } from '@prisma/client';
import { QuoteStateMachine } from './quote-state-machine.js';

describe('QuoteStateMachine', () => {
  const machine = new QuoteStateMachine();
  it.each([
    [QuoteStatus.DRAFT, QuoteStatus.SENT],
    [QuoteStatus.SENT, QuoteStatus.VIEWED],
    [QuoteStatus.VIEWED, QuoteStatus.ACCEPTED],
    [QuoteStatus.SENT, QuoteStatus.REJECTED],
    [QuoteStatus.ACCEPTED, QuoteStatus.BOOKED],
  ])('allows %s -> %s', (from, to) => expect(machine.canTransition(from, to)).toBe(true));
  it.each([
    [QuoteStatus.DRAFT, QuoteStatus.ACCEPTED],
    [QuoteStatus.REJECTED, QuoteStatus.ACCEPTED],
    [QuoteStatus.EXPIRED, QuoteStatus.SENT],
    [QuoteStatus.BOOKED, QuoteStatus.CANCELLED],
  ])('rejects %s -> %s', (from, to) => expect(machine.canTransition(from, to)).toBe(false));
});
