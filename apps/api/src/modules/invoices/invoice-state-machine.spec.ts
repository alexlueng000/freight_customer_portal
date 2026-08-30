import { InvoiceStatus } from '@prisma/client';
import { InvoiceStateMachine } from './invoice-state-machine.js';

describe('InvoiceStateMachine', () => {
  const machine = new InvoiceStateMachine();
  it('allows approved transitions', () => {
    expect(() => machine.assertTransition(InvoiceStatus.DRAFT, InvoiceStatus.ISSUED)).not.toThrow();
    expect(() =>
      machine.assertTransition(InvoiceStatus.ISSUED, InvoiceStatus.CUSTOMER_CONFIRMED),
    ).not.toThrow();
    expect(() =>
      machine.assertTransition(InvoiceStatus.CUSTOMER_CONFIRMED, InvoiceStatus.PAID),
    ).not.toThrow();
  });
  it('rejects skipped and terminal transitions', () => {
    expect(() => machine.assertTransition(InvoiceStatus.DRAFT, InvoiceStatus.PAID)).toThrow();
    expect(() => machine.assertTransition(InvoiceStatus.PAID, InvoiceStatus.VOID)).toThrow();
  });
});
