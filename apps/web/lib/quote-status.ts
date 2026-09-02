import type { StatusTone } from '@/lib/mock-data';

export const quoteStatusLabels: Record<string, string> = {
  DRAFT: '待销售确认',
  SENT: '已发送',
  VIEWED: '已查看',
  ACCEPTED: '已接受',
  REJECTED: '已拒绝',
  EXPIRED: '已过期',
  BOOKED: '已转订舱',
  CANCELLED: '已取消',
};

export const customerQuoteStatusLabels: Record<string, string> = {
  ...quoteStatusLabels,
  SENT: '销售已确认',
  VIEWED: '已查看',
};

export const quoteStatusTones: Record<string, StatusTone> = {
  DRAFT: 'warning',
  SENT: 'info',
  VIEWED: 'info',
  ACCEPTED: 'success',
  REJECTED: 'danger',
  EXPIRED: 'warning',
  BOOKED: 'success',
  CANCELLED: 'neutral',
};

export function quoteStatusLabel(status: string) {
  return quoteStatusLabels[status] ?? status;
}

export function customerQuoteStatusLabel(status: string) {
  return customerQuoteStatusLabels[status] ?? status;
}

export function quoteStatusTone(status: string): StatusTone {
  return quoteStatusTones[status] ?? 'neutral';
}
