export function isSailingPattern(value?: string) {
  return /^(SUN|MON|TUE|WED|THU|FRI|SAT|(?:每)?(?:周|星期)[一二三四五六日天]|每月(?:[1-9]|[12]\d|3[01])日)$/i.test(value?.trim() ?? '');
}

export function customerSailingPattern(remark: string | null): string | null {
  // Only publish recognized sailing values, never the rest of an internal remark.
  for (const part of (remark ?? '').split(' | ')) {
    const value = /^Schedule:\s*(.+)$/.exec(part.trim())?.[1]?.trim();
    if (isSailingPattern(value)) return value!;
  }
  return null;
}
