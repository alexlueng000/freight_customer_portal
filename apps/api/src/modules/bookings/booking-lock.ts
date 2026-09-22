import type { Prisma } from '@prisma/client';

// Serialize changes to the same booking, including confirmation versions and handoff.
export async function lockBooking(
  tx: Prisma.TransactionClient,
  tenantId: string,
  bookingId: string,
) {
  await tx.$queryRaw`SELECT "id" FROM "Booking" WHERE "tenantId" = ${tenantId} AND "id" = ${bookingId} FOR UPDATE`;
}
