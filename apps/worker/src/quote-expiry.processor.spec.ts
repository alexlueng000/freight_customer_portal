import { QuoteStatus } from '@prisma/client';
import { expireDueQuotes } from './quote-expiry.processor.js';

describe('expireDueQuotes', () => {
  it('expires due open quotes and writes a system audit record', async () => {
    const updateMany = jest.fn().mockResolvedValue({ count: 1 });
    const auditCreate = jest.fn((argument: unknown): Promise<unknown> => Promise.resolve(argument));
    const prisma = {
      quote: {
        findMany: jest
          .fn()
          .mockResolvedValue([{ id: 'quote-a', tenantId: 'tenant-a', status: QuoteStatus.SENT }]),
      },
      $transaction: jest.fn(async (callback: (tx: unknown) => Promise<void>) =>
        callback({ quote: { updateMany }, auditLog: { create: auditCreate } }),
      ),
    };
    const count = await expireDueQuotes(prisma as never, new Date('2026-08-29T12:00:00Z'));
    expect(count).toBe(1);
    expect(updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: { status: QuoteStatus.EXPIRED } }),
    );
    expect(auditCreate).toHaveBeenCalledTimes(1);
    const auditArgument: unknown = auditCreate.mock.calls[0]?.[0];
    expect(auditArgument).toMatchObject({
      data: { tenantId: 'tenant-a', action: 'STATUS_EXPIRED' },
    });
  });
});
