export const portalServiceLabels: Record<string, string> = {
  OCEAN_FCL: '海运 FCL',
  ORIGIN_PICKUP: '起运地拖车 / 提货',
  EXPORT_CUSTOMS: '出口报关',
  IMPORT_CUSTOMS: '目的港清关',
  DESTINATION_DELIVERY: '目的地派送',
};

export interface PortalBranding {
  portalSlug: string;
  companyName: string;
  logoUrl: string | null;
  primaryBrandColor: string;
  heroTitle: string;
  heroSubtitle: string;
  serviceTags: string[];
  contact: {
    phone: string | null;
    email: string | null;
    website: string | null;
    address: string | null;
    wechat: string | null;
    whatsapp: string | null;
  };
}

export function brandColorStyle(color?: string): CSSProperties {
  return color && /^#[0-9a-f]{6}$/i.test(color)
    ? ({ '--portal-brand': color } as CSSProperties)
    : {};
}

export async function getPortalBranding(portalSlug: string): Promise<PortalBranding | null> {
  const apiUrl = process.env.API_INTERNAL_URL ?? 'http://localhost:4000';
  const response = await fetch(
    `${apiUrl}/api/v1/portal-branding/${encodeURIComponent(portalSlug.toLowerCase())}`,
    { cache: 'no-store' },
  ).catch(() => null);
  if (!response?.ok) return null;
  return (await response.json()) as PortalBranding;
}

export function isSafePortalNextPath(value: string | null): value is string {
  return Boolean(value && (value === '/portal' || value.startsWith('/portal/')));
}
import type { CSSProperties } from 'react';
