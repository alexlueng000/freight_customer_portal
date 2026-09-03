import type { StatusTone } from '@/lib/mock-data';

export interface ShipmentStatusMeta {
  label: string;
  customerLabel: string;
  description: string;
  customerDescription: string;
  tone: StatusTone;
}

export const shipmentStatusMeta: Record<string, ShipmentStatusMeta> = {
  PLANNED: {
    label: '待开船',
    customerLabel: '待开船',
    description: 'Shipment 已创建，等待实际离港。',
    customerDescription: '订舱已完成，正在等待实际开船。',
    tone: 'neutral',
  },
  DEPARTED: {
    label: '已开船',
    customerLabel: '运输中',
    description: '货物已实际开船，下一步跟进到港。',
    customerDescription: '货物已实际开船，正在运输中。',
    tone: 'info',
  },
  ARRIVED: {
    label: '已到港',
    customerLabel: '已到港',
    description: '货物已实际抵达目的港。',
    customerDescription: '货物已实际抵达目的港。',
    tone: 'success',
  },
  CANCELLED: {
    label: '已取消',
    customerLabel: '已取消',
    description: '该 Shipment 已取消，不再继续更新进度。',
    customerDescription: '该 Shipment 已取消。',
    tone: 'danger',
  },
};

export function shipmentStatusLabel(status: string, mode: 'admin' | 'portal' = 'admin') {
  const meta = shipmentStatusMeta[status];
  if (!meta) return '状态未知';
  return mode === 'portal' ? meta.customerLabel : meta.label;
}

export function shipmentStatusDescription(status: string, mode: 'admin' | 'portal' = 'admin') {
  const meta = shipmentStatusMeta[status];
  if (!meta) return '请刷新后查看最新状态。';
  return mode === 'portal' ? meta.customerDescription : meta.description;
}

export function shipmentStatusTone(status: string): StatusTone {
  return shipmentStatusMeta[status]?.tone ?? 'neutral';
}
