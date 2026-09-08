import { TenantStatus } from '@prisma/client';
import { BrandingService } from './branding.service.js';

describe('BrandingService', () => {
  const findFirst = jest.fn();
  const service = new BrandingService({ tenant: { findFirst } } as never);

  beforeEach(() => findFirst.mockReset());

  it('returns only public branding with safe defaults', async () => {
    findFirst.mockResolvedValue({
      portalSlug: 'northstar',
      name: 'Northstar Logistics Ltd.',
      brandName: null,
      logoUrl: null,
      primaryBrandColor: null,
      heroTitle: null,
      heroSubtitle: null,
      phone: null,
      email: 'service@example.test',
      website: null,
      address: null,
      wechat: null,
      whatsapp: null,
      serviceTags: [],
    });

    await expect(service.getPublicBranding('NORTHSTAR')).resolves.toMatchObject({
      portalSlug: 'northstar',
      companyName: 'Northstar Logistics Ltd.',
      primaryBrandColor: '#087E8B',
      serviceTags: ['OCEAN_FCL'],
    });
    expect(findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          portalSlug: 'northstar',
          status: { in: [TenantStatus.TRIAL, TenantStatus.ACTIVE] },
        },
      }),
    );
  });

  it('does not expose unknown or inactive portals', async () => {
    findFirst.mockResolvedValue(null);
    await expect(service.getPublicBranding('closed')).rejects.toMatchObject({ status: 404 });
  });
});
