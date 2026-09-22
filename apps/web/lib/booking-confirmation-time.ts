// Input offsets are explicit: neither the browser nor server timezone defines a business time.
export function confirmationTimeToIso(value: string, offset = '+08:00'): string {
  if (
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value) ||
    !/^[+-](?:0\d|1[0-4]):[0-5]\d$/.test(offset)
  ) {
    throw new Error('请输入有效日期、时间和时区。');
  }
  const date = new Date(`${value}:00${offset}`);
  const local = new Date(`${value}:00Z`);
  if (!Number.isFinite(date.getTime()) || local.toISOString().slice(0, 16) !== value) {
    throw new Error('请输入有效日期和时间。');
  }
  return date.toISOString();
}

export function formatConfirmationTime(value: string | null | undefined): string {
  if (!value) return '未提供 / 待船司确认';
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return '时间无效，请核对';
  return `${new Intl.DateTimeFormat('zh-CN', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(date)}（北京时间 UTC+08:00）`;
}

export function confirmationTimeInput(value: string | null | undefined): string {
  if (!value) return '';
  return new Date(new Date(value).getTime() + 8 * 60 * 60 * 1000).toISOString().slice(0, 16);
}

export function cutoffHint(value: string | null | undefined, now = Date.now()): string {
  if (!value) return '';
  const remaining = new Date(value).getTime() - now;
  if (remaining < 0) return '时间已过，请核对办理情况；不代表业务逾期';
  if (remaining <= 24 * 60 * 60 * 1000) return '距截止不足 24 小时，请核对安排';
  return '';
}
