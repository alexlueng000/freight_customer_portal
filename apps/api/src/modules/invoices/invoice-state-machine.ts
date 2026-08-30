import { BadRequestException, Injectable } from '@nestjs/common';
import { InvoiceStatus } from '@prisma/client';

const transitions: Record<InvoiceStatus, readonly InvoiceStatus[]> = {
  DRAFT: [InvoiceStatus.ISSUED, InvoiceStatus.VOID],
  ISSUED: [InvoiceStatus.CUSTOMER_CONFIRMED, InvoiceStatus.PAID, InvoiceStatus.VOID],
  CUSTOMER_CONFIRMED: [InvoiceStatus.PAID, InvoiceStatus.VOID],
  PAID: [],
  VOID: [],
};

@Injectable()
export class InvoiceStateMachine {
  assertTransition(from: InvoiceStatus, to: InvoiceStatus) {
    if (!transitions[from].includes(to))
      throw new BadRequestException({
        code: 'ILLEGAL_INVOICE_TRANSITION',
        message: `Invoice cannot transition from ${from} to ${to}`,
      });
  }
}
