import { QuoteStatus } from '@prisma/client';
import type { Prisma } from '@prisma/client';
import { ports } from '../rates/port-search.js';
import type { ListQuotesDto } from './dto/list-quotes.dto.js';

const expirable: QuoteStatus[] = [QuoteStatus.DRAFT, QuoteStatus.SENT, QuoteStatus.VIEWED];
const literal = (value: string) => value.trim().replace(/[\\%_]/g, '\\$&');

export function customerQuoteFilters(query: ListQuotesDto, today: Date): Prisma.QuoteWhereInput {
  const and: Prisma.QuoteWhereInput[] = [];
  const statuses = query.statuses ?? (query.status ? [query.status] : []);
  if (statuses.length)
    and.push({
      OR: statuses.map((status) =>
        status === QuoteStatus.EXPIRED
          ? { OR: [{ status }, { status: { in: expirable }, validUntil: { lt: today } }] }
          : { status, ...(expirable.includes(status) ? { validUntil: { gte: today } } : {}) },
      ),
    });
  for (const side of ['pol', 'pod'] as const) {
    const keyword = query[side]?.trim();
    if (!keyword) continue;
    const normalized = keyword.toLowerCase().replace(/\s+/g, '');
    const exact = ports.filter((port) =>
      port.some((name) => name.toLowerCase().replace(/\s+/g, '') === normalized),
    );
    const codes = (
      exact.length
        ? exact
        : ports.filter((port) =>
            port.some((name) => name.toLowerCase().replace(/\s+/g, '').includes(normalized)),
          )
    ).map(([code]) => code);
    and.push({
      OR: [
        { [`${side}Code`]: { contains: literal(keyword), mode: 'insensitive' } },
        { [`${side}Code`]: { in: codes } },
        { sourceRate: { [`${side}Name`]: { contains: literal(keyword), mode: 'insensitive' } } },
      ],
    });
  }
  if (query.quoteNo?.trim())
    and.push({ quoteNo: { contains: literal(query.quoteNo), mode: 'insensitive' } });
  if (query.carrierCode?.trim())
    and.push({ carrierCode: { contains: literal(query.carrierCode), mode: 'insensitive' } });
  return and.length ? { AND: and } : {};
}
