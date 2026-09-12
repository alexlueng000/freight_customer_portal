import type { Prisma } from '@prisma/client';

// Common locations used by the rate importer, not a complete UN/LOCODE directory.
// Keep distinct ports distinct; aliases here only support searching, never rewriting rates.
export const ports = [
  ['CNSHA', '上海', 'Shanghai', '沪'],
  ['CNNGB', '宁波', 'Ningbo'],
  ['CNSZX', '深圳', 'Shenzhen'],
  ['CNXMN', '厦门', 'Xiamen'],
  ['CNTAO', '青岛', 'Qingdao'],
  ['SGSIN', '新加坡', 'Singapore'],
  ['MYPKG', '巴生港', 'Port Klang'],
  ['THBKK', '曼谷', 'Bangkok'],
  ['VNSGN', '胡志明市', 'Ho Chi Minh City', 'Ho Chi Minh', 'Saigon', '西贡'],
  ['IDJKT', '雅加达', 'Jakarta'],
  ['USLAX', '洛杉矶', 'Los Angeles', 'Los Angeles CA', 'LA'],
  ['USLGB', '长滩', 'Long Beach', 'Long Beach CA'],
  ['USNYC', '纽约', 'New York', 'New York NY'],
  ['USSAV', '萨凡纳', 'Savannah', 'Savannah GA'],
  ['USOAK', '奥克兰（美国）', 'Oakland'],
  ['USTIW', '塔科马', 'Tacoma'],
  ['USSEA', '西雅图', 'Seattle'],
  ['KRPUS', '釜山', 'Busan', 'Pusan'],
  ['DEHAM', '汉堡', 'Hamburg'],
] as const;

const normalize = (value: string) => value.trim().toLowerCase().replace(/\s+/g, '');

export function portDisplayName(code: string, originalName: string): string {
  return ports.find((port) => port[0] === code.trim().toUpperCase())?.[1]
    ?? (originalName.trim() || code);
}

export function portSearchFilter(side: 'pol' | 'pod', input?: string): Prisma.RateWhereInput {
  const keyword = input?.trim();
  if (!keyword) return {};
  const normalized = normalize(keyword);
  const exactMatches = ports.filter(([code, ...names]) =>
    normalize(code) === normalized || normalize(code.slice(2)) === normalized ||
    names.some((name) => normalize(name) === normalized));
  const matchingCodes = (exactMatches.length ? exactMatches : ports.filter(([, ...names]) =>
    names.some((name) => normalize(name).includes(normalized))))
    .map(([code]) => code);
  // Escape LIKE metacharacters so a literal % or _ cannot broaden a search.
  const literal = keyword.replace(/[\\%_]/g, '\\$&');
  const nameKeywords = exactMatches.length
    ? exactMatches.flatMap(([, chineseName, englishName]) => [chineseName, englishName])
    : [literal];
  return {
    OR: [
      { [`${side}Code`]: { equals: literal, mode: 'insensitive' } },
      ...nameKeywords.map((name) => ({ [`${side}Name`]: { contains: name, mode: 'insensitive' } })),
      ...(matchingCodes.length ? [{ [`${side}Code`]: { in: matchingCodes } }] : []),
    ],
  };
}
