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
    href: '/portal/shipments?status=active',
    tone: 'info',
  },
  {
    label: '待处理报价',
    value: '7',
    detail: '其中 2 份今日到期',
    href: '/portal/quotes?status=pending',
    tone: 'warning',
  },
  {
    label: '近期离港',
    value: '11',
    detail: '盐田、宁波、上海',
    href: '/portal/shipments?departure=upcoming',
    tone: 'neutral',
  },
  {
    label: '未结账单',
    value: 'USD 42.8K',
    detail: 'CNY 18.5K · 3 张账单已逾期',
    href: '/portal/billing?status=outstanding',
    tone: 'danger',
  },
];

export const portalShipments: ShipmentRow[] = [
  {
    shipmentNo: 'SHP202608000118',
    lane: '盐田 -> 洛杉矶',
    carrier: 'COSCO',
    eta: '9月4日',
    status: '船舶已离港',
    tone: 'info',
  },
  {
    shipmentNo: 'SHP202608000121',
    lane: '宁波 -> 长滩',
    carrier: 'ONE',
    eta: '9月8日',
    status: '已装船',
    tone: 'success',
  },
  {
    shipmentNo: 'SHP202608000126',
    lane: '上海 -> 鹿特丹',
    carrier: 'Maersk',
    eta: '9月15日',
    status: '已进港',
    tone: 'neutral',
  },
  {
    shipmentNo: 'SHP202608000129',
    lane: '青岛 -> 汉堡',
    carrier: 'Hapag-Lloyd',
    eta: '9月19日',
    status: '待补单证',
    tone: 'warning',
  },
];

export const portalActions: ActionRow[] = [
  { item: '接受报价 QT202608000142', owner: '采购部', due: '今天到期', status: '待处理', tone: 'warning' },
  { item: '确认账单 INV202608000061', owner: '财务部', due: '8月30日', status: '待确认', tone: 'info' },
  { item: '补充订舱 BKG202608000077 货物信息', owner: '操作联系人', due: '9月1日', status: '草稿', tone: 'neutral' },
];

export const adminStats: StatItem[] = [
  {
    label: '待审订舱',
    value: '14',
    detail: '今日新提交 5 单',
    href: '/admin/bookings?status=submitted',
    tone: 'warning',
  },
  {
    label: '待放 SO',
    value: '9',
    detail: '3 单已确认但未上传 SO',
    href: '/admin/bookings?status=confirmed&so=missing',
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
    value: 'USD 188K',
    detail: 'CNY 96K · 覆盖 22 家客户',
    href: '/admin/invoices?status=outstanding',
    tone: 'neutral',
  },
];

export const adminTasks: ActionRow[] = [
  { item: '审核 BKG202608000088', owner: '操作', due: '今天', status: '已提交', tone: 'warning' },
  { item: '为 BKG202608000083 放 SO', owner: '操作', due: '今天', status: '已确认', tone: 'danger' },
  { item: '发送报价 QT202608000155', owner: '销售', due: '明天', status: '草稿', tone: 'neutral' },
  { item: '跟进逾期账单 INV202608000050', owner: '财务', due: '已逾期', status: '已开票', tone: 'danger' },
];

export const adminQuoteBookings: QuoteBookingRow[] = [
  { label: '本周', quotes: 48, bookings: 17, conversion: '35%' },
  { label: '上周', quotes: 53, bookings: 21, conversion: '40%' },
  { label: '本月至今', quotes: 166, bookings: 66, conversion: '40%' },
];
