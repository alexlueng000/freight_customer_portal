import type { StatusTone } from '@/lib/mock-data';

export const bookingStatusLabels: Record<string, string> = {
  DRAFT: '草稿',
  SUBMITTED: '待审核',
  REVISION_REQUIRED: '待补充资料',
  APPROVED: '待订舱',
  BOOKING_SUBMITTED: '已提交订舱 · 待 SO',
  BOOKED: '已订舱',
  REJECTED: '已拒绝',
  CANCELLED: '已取消',
};

export const customerBookingStatusLabels: Record<string, string> = {
  ...bookingStatusLabels,
  SUBMITTED: '已提交',
  APPROVED: '处理中',
  BOOKING_SUBMITTED: '已提交订舱 · 待 SO',
};

export const bookingStatusTones: Record<string, StatusTone> = {
  DRAFT: 'warning',
  SUBMITTED: 'info',
  REVISION_REQUIRED: 'warning',
  APPROVED: 'info',
  BOOKING_SUBMITTED: 'info',
  BOOKED: 'success',
  REJECTED: 'danger',
  CANCELLED: 'neutral',
};

export function bookingStatusLabel(status: string) {
  return bookingStatusLabels[status] ?? status;
}

export function customerBookingStatusLabel(status: string) {
  return customerBookingStatusLabels[status] ?? status;
}

export function bookingStatusTone(status: string): StatusTone {
  return bookingStatusTones[status] ?? 'neutral';
}
