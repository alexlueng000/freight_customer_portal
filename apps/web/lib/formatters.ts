export function formatDate(value: string | null | undefined, fallback = '-'): string {
  if (!value) return fallback;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return fallback;
  const parts = new Intl.DateTimeFormat('en-CA', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  return `${part(parts, 'year')}-${part(parts, 'month')}-${part(parts, 'day')}`;
}

export function formatDateTime(value: string | null | undefined, fallback = '-'): string {
  if (!value) return fallback;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return fallback;
  const parts = new Intl.DateTimeFormat('en-CA', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(date);
  return `${part(parts, 'year')}-${part(parts, 'month')}-${part(parts, 'day')} ${part(parts, 'hour')}:${part(parts, 'minute')}`;
}

export function formatMoney(value: string | number | null | undefined, currency: string): string {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return `${currency} -`;
  return `${currency} ${new Intl.NumberFormat('zh-CN', {
    maximumFractionDigits: 2,
    minimumFractionDigits: 0,
  }).format(amount)}`;
}

export function formatContainerSummary(
  items: Array<{ containerType: string | null; quantity: string | number | null | undefined }>,
  fallback = '-',
): string {
  const formatted = items
    .filter((item) => item.containerType && Number(item.quantity) > 0)
    .map((item) => `${Number(item.quantity).toLocaleString('zh-CN')} × ${item.containerType}`);
  return formatted.length ? formatted.join(' / ') : fallback;
}

export function formatRouteSummary(
  polCode: string | null | undefined,
  podCode: string | null | undefined,
  polName?: string | null,
  podName?: string | null,
): string {
  const origin = polName || polCode || '-';
  const destination = podName || podCode || '-';
  return `${origin} → ${destination}`;
}

function part(parts: Intl.DateTimeFormatPart[], type: Intl.DateTimeFormatPartTypes) {
  return parts.find((item) => item.type === type)?.value ?? '';
}
