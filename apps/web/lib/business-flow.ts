import { bookingStatusLabel, customerBookingStatusLabel } from './booking-status.ts';
import { shipmentStatusLabel } from './shipment-status.ts';

export type BusinessFlowStage =
  | 'rate'
  | 'quoteRequest'
  | 'formalQuote'
  | 'booking'
  | 'shipment'
  | 'tracking'
  | 'document'
  | 'invoice';

export interface BusinessFlowState {
  currentStage: BusinessFlowStage;
  currentStageComplete: boolean;
  currentStatus: string;
  stopped?: boolean;
}

export function resolveShipmentBusinessFlow(
  shipment: FlowShipment,
  audience: 'admin' | 'portal' = 'admin',
): BusinessFlowState {
  const currentStatus = shipmentStatusLabel(shipment.status, audience);
  if (shipment.status === 'ARRIVED') {
    return { currentStage: 'shipment', currentStageComplete: true, currentStatus };
  }
  if (shipment.status === 'DEPARTED') {
    return { currentStage: 'shipment', currentStageComplete: false, currentStatus };
  }
  if (shipment.status === 'CANCELLED') {
    return { currentStage: 'shipment', currentStageComplete: false, currentStatus, stopped: true };
  }
  return { currentStage: 'shipment', currentStageComplete: false, currentStatus };
}

export function resolveInvoiceBusinessFlow(invoice: { status: string }): BusinessFlowState {
  return {
    currentStage: 'invoice',
    currentStageComplete: invoice.status === 'PAID',
    currentStatus: invoiceStatusLabel(invoice.status),
  };
}

interface FlowShipment {
  status: string;
}

interface FlowBooking {
  status: string;
  shipments: FlowShipment[];
}

export function resolveBookingBusinessFlow(
  booking: FlowBooking,
  audience: 'admin' | 'portal' = 'admin',
): BusinessFlowState {
  const shipment = booking.shipments[0];
  if (shipment) return resolveShipmentBusinessFlow(shipment, audience);
  return {
    currentStage: 'booking',
    currentStageComplete: booking.status === 'BOOKED',
    currentStatus:
      audience === 'portal'
        ? customerBookingStatusLabel(booking.status)
        : bookingStatusLabel(booking.status),
    ...(['REJECTED', 'CANCELLED'].includes(booking.status) ? { stopped: true } : {}),
  };
}

export function resolveQuoteBusinessFlow(
  quote: { status: string; bookings: FlowBooking[] },
  quoteStatusText: string,
  audience: 'admin' | 'portal' = 'admin',
): BusinessFlowState {
  const booking = quote.bookings[0];
  if (booking) return resolveBookingBusinessFlow(booking, audience);
  return {
    currentStage: quote.status === 'BOOKED' ? 'booking' : 'formalQuote',
    currentStageComplete: quote.status === 'ACCEPTED',
    currentStatus: quoteStatusText,
    ...(['REJECTED', 'CANCELLED', 'EXPIRED'].includes(quote.status) ? { stopped: true } : {}),
  };
}

function invoiceStatusLabel(status: string) {
  const labels: Record<string, string> = {
    DRAFT: '草稿',
    ISSUED: '已发布',
    CUSTOMER_CONFIRMED: '客户已确认',
    PAID: '已收款',
    VOID: '已作废',
  };
  return labels[status] ?? '状态未知';
}
