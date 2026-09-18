export function rateSailingLabel(rate: {
  etd: string | null;
  sailingPattern?: string | null;
  prices?: Array<{ remark: string | null }>;
}): string {
  if (rate.etd) return rate.etd.slice(0, 10);
  if (rate.sailingPattern) return rate.sailingPattern;

  // Imports persist non-date sailing information in each container price's remark.
  const schedules = (rate.prices ?? []).flatMap(({ remark }) =>
    (remark ?? '').split(' | ').flatMap((part) => {
      const match = /^Schedule:\s*(.+)$/.exec(part.trim());
      return match ? [match[1]!.trim()] : [];
    }));
  return [...new Set(schedules)].join('；') || '—';
}
