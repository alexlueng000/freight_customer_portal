import type { Prisma } from '@prisma/client';

// This is the shared customer/print whitelist. Do not spread a booking or quote entity here.
export const submissionSelect = {
  bookingNo: true,
  quoteId: true,
  polCode: true,
  podCode: true,
  carrierCode: true,
  serviceName: true,
  etd: true,
  incoterm: true,
  requestedServices: true,
  pickupLocationText: true,
  deliveryLocationText: true,
  commodity: true,
  packageType: true,
  packages: true,
  grossWeight: true,
  volumeCbm: true,
  cargoReadyDate: true,
  isDangerousGoods: true,
  specialInstructions: true,
  shipperName: true,
  shipperAddress: true,
  bookingContactName: true,
  bookingContactEmail: true,
  bookingContactPhone: true,
  customer: { select: { name: true } },
  quote: { select: { quoteNo: true, customerTerms: true } },
  cargoItems: {
    select: {
      commodity: true,
      estimatedGrossWeight: true,
      cargoNature: true,
      specialRequirement: true,
    },
    orderBy: { sortOrder: 'asc' as const },
  },
  containerRequests: {
    select: { containerType: true, quantity: true, weightPerContainer: true, remark: true },
    orderBy: { sortOrder: 'asc' as const },
  },
} satisfies Prisma.BookingSelect;

export function submissionSnapshot(
  booking: Prisma.BookingGetPayload<{ select: typeof submissionSelect }>,
): Prisma.InputJsonObject {
  return JSON.parse(JSON.stringify(booking)) as Prisma.InputJsonObject;
}
