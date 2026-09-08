import { Injectable, NotFoundException } from '@nestjs/common';
import { TenantStatus } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service.js';

const DEFAULT_SERVICES = ['OCEAN_FCL'] as const;

@Injectable()
export class BrandingService {
  constructor(private readonly prisma: PrismaService) {}

  async getPublicBranding(portalSlug: string) {
    const tenant = await this.prisma.tenant.findFirst({
      where: {
        portalSlug: portalSlug.trim().toLowerCase(),
        status: { in: [TenantStatus.TRIAL, TenantStatus.ACTIVE] },
      },
      select: {
        portalSlug: true,
        name: true,
        brandName: true,
        logoUrl: true,
        primaryBrandColor: true,
        heroTitle: true,
        heroSubtitle: true,
        phone: true,
        email: true,
        website: true,
        address: true,
        wechat: true,
        whatsapp: true,
        serviceTags: true,
      },
    });

    if (!tenant?.portalSlug) {
      throw new NotFoundException({
        code: 'PORTAL_NOT_FOUND',
        message: 'Customer portal is unavailable',
      });
    }

    return {
      portalSlug: tenant.portalSlug,
      companyName: tenant.brandName ?? tenant.name,
      logoUrl: tenant.logoUrl,
      primaryBrandColor: tenant.primaryBrandColor ?? '#087E8B',
      heroTitle: tenant.heroTitle ?? '让国际物流更简单',
      heroSubtitle:
        tenant.heroSubtitle ?? '在线查询海运价格、获取正式报价，随时掌握订舱与出运进度。',
      serviceTags: tenant.serviceTags.length ? tenant.serviceTags : [...DEFAULT_SERVICES],
      contact: {
        phone: tenant.phone,
        email: tenant.email,
        website: tenant.website,
        address: tenant.address,
        wechat: tenant.wechat,
        whatsapp: tenant.whatsapp,
      },
    };
  }
}
