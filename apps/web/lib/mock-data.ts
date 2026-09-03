export type StatusTone = 'neutral' | 'info' | 'success' | 'warning' | 'danger';

export interface StatItem {
  label: string;
  value: string;
  detail: string;
  href: string;
  tone?: StatusTone;
}

export interface ShipmentRow {
  shipmentNo: string;
  lane: string;
  carrier: string;
  eta: string;
  status: string;
  tone: StatusTone;
}

export interface ActionRow {
  item: string;
  owner: string;
  due: string;
  status: string;
  tone: StatusTone;
  href: string;
  actionLabel: string;
}

export interface QuoteBookingRow {
  label: string;
  quotes: number;
  bookings: number;
  conversion: string;
}

export const portalStats: StatItem[] = [
  {
    label: '在线出运',
    value: '18',
    detail: '未来 7 天内有 6 票到港',
    href: '/portal/shipments?status=DEPARTED',
    tone: 'info',
  },
  {
    label: '待处理报价',
    value: '7',
    detail: '其中 2 份今日到期',
    href: '/portal/quotes?status=SENT',
    tone: 'warning',
  },
  {
    label: '近期离港',
    value: '11',
    detail: '盐田、宁波、上海',
    href: '/portal/shipments?status=PLANNED',
    tone: 'neutral',
  },
  {
    label: '未结账单',
    value: 'USD 42,800',
    detail: 'CNY 18,500 · 3 张账单已逾期',
    href: '/portal/billing?status=outstanding',
    tone: 'danger',
  },
];

export const portalShipments: ShipmentRow[] = [
  {
    shipmentNo: 'SHP202608000118',
    lane: '盐田 → 洛杉矶',
    carrier: 'COSCO',
    eta: '2026-09-04',
    status: '运输中',
    tone: 'info',
  },
  {
    shipmentNo: 'SHP202608000121',
    lane: '宁波 → 长滩',
    carrier: 'ONE',
    eta: '2026-09-08',
    status: '运输中',
    tone: 'success',
  },
  {
    shipmentNo: 'SHP202608000126',
    lane: '上海 → 鹿特丹',
    carrier: 'Maersk',
    eta: '2026-09-15',
    status: '待开船',
    tone: 'neutral',
  },
  {
    shipmentNo: 'SHP202608000129',
    lane: '青岛 → 汉堡',
    carrier: 'Hapag-Lloyd',
    eta: '2026-09-19',
    status: '待补充资料',
    tone: 'warning',
  },
];

export const portalActions: ActionRow[] = [
  { item: '接受报价 QT202608000142', owner: '采购部', due: '今天到期', status: '待确认', tone: 'warning', href: '/portal/quotes?status=SENT', actionLabel: '查看报价' },
  { item: '确认账单 INV202608000061', owner: '财务部', due: '2026-08-30', status: '待确认', tone: 'info', href: '/portal/billing?status=ISSUED', actionLabel: '查看账单' },
  { item: '补充订舱 BKG202608000077 货物信息', owner: '操作联系人', due: '2026-09-01', status: '待补充资料', tone: 'warning', href: '/portal/bookings?status=REVISION_REQUIRED', actionLabel: '继续填写' },
];

export const adminStats: StatItem[] = [
  {
    label: '待审订舱',
    value: '14',
    detail: '今日新提交 5 单',
    href: '/admin/bookings?status=SUBMITTED',
    tone: 'warning',
  },
  {
    label: '待放 SO',
    value: '9',
    detail: '3 单已提交船司但待登记 SO',
    href: '/admin/bookings?status=BOOKING_SUBMITTED',
    tone: 'danger',
  },
  {
    label: '近期离港',
    value: '27',
    detail: '未来 10 天',
    href: '/admin/shipments?departure=upcoming',
    tone: 'info',
  },
  {
    label: '未结账单',
    value: 'USD 188,000',
    detail: 'CNY 96,000 · 覆盖 22 家客户',
    href: '/admin/invoices?status=outstanding',
    tone: 'neutral',
  },
];

export const adminTasks: ActionRow[] = [
  { item: '审核 BKG202608000088', owner: '操作', due: '今天', status: '待审核', tone: 'warning', href: '/admin/bookings?status=SUBMITTED', actionLabel: '进入审核队列' },
  { item: '登记 BKG202608000083 的 SO', owner: '操作', due: '今天', status: '待 SO', tone: 'danger', href: '/admin/bookings?status=BOOKING_SUBMITTED', actionLabel: '登记 SO' },
  { item: '确认并发送 QT202608000155', owner: '销售', due: '明天', status: '待销售确认', tone: 'neutral', href: '/admin/quotes?status=DRAFT', actionLabel: '查看审核' },
  { item: '跟进逾期账单 INV202608000050', owner: '财务', due: '已逾期', status: '已开票', tone: 'danger', href: '/admin/invoices?status=ISSUED', actionLabel: '查看账单' },
];

export const adminQuoteBookings: QuoteBookingRow[] = [
  { label: '本周', quotes: 48, bookings: 17, conversion: '35%' },
  { label: '上周', quotes: 53, bookings: 21, conversion: '40%' },
  { label: '本月至今', quotes: 166, bookings: 66, conversion: '40%' },
];
