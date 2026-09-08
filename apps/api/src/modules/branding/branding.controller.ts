import { Controller, Get, Param } from '@nestjs/common';
import { ApiNotFoundResponse, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { Public } from '../auth/public.decorator.js';
import { BrandingService } from './branding.service.js';

@ApiTags('portal-branding')
@Controller({ path: 'portal-branding', version: '1' })
export class BrandingController {
  constructor(private readonly branding: BrandingService) {}

  @Public()
  @Get(':portalSlug')
  @ApiOkResponse({ description: 'Public, display-only branding for an active tenant portal' })
  @ApiNotFoundResponse({ description: 'Portal slug is unknown or the tenant is inactive' })
  getPublicBranding(@Param('portalSlug') portalSlug: string) {
    return this.branding.getPublicBranding(portalSlug);
  }
}
