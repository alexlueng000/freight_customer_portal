import type { Prisma, PrismaClient } from '@prisma/client';
import { QuoteStatus } from '@prisma/client';

const EXPIRABLE = [QuoteStatus.DRAFT, QuoteStatus.SENT, QuoteStatus.VIEWED];

export async function expireDueQuotes(prisma: PrismaClient, now = new Date()) {
  const todayUtc = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const due = await prisma.quote.findMany({
    where: { validUntil: { lt: todayUtc }, status: { in: EXPIRABLE } },
    select: { id: true, tenantId: true, status: true },
    take: 500,
  });
  let expired = 0;
  for (const quote of due) {
    await prisma.$transaction(async (tx) => {
      const result = await tx.quote.updateMany({
        where: { id: quote.id, tenantId: quote.tenantId, status: quote.status },
        data: { status: QuoteStatus.EXPIRED },
      });
      if (result.count !== 1) return;
      await tx.auditLog.create({
        data: {
          tenantId: quote.tenantId,
          entityType: 'Quote',
          entityId: quote.id,
          action: 'STATUS_EXPIRED',
          beforeData: { status: quote.status },
          afterData: {
            status: QuoteStatus.EXPIRED,
            source: 'scheduled-worker',
          } satisfies Prisma.InputJsonValue,
        },
      });
      expired += 1;
    });
  }
  return expired;
}
