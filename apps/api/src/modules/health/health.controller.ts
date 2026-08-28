import { Controller, Get, Header } from '@nestjs/common';
import { ApiOkResponse, ApiServiceUnavailableResponse, ApiTags } from '@nestjs/swagger';
import type { HealthResponse } from '@freight/types';
import { Public } from '../auth/public.decorator.js';
import { HealthService } from './health.service.js';

@ApiTags('health')
@Public()
@Controller({ path: 'health', version: '1' })
export class HealthController {
  constructor(private readonly healthService: HealthService) {}

  @Get()
  @Header('Cache-Control', 'no-store')
  @ApiOkResponse({ description: 'API liveness status' })
  getHealth(): HealthResponse {
    return this.healthService.getHealth();
  }

  @Get('ready')
  @Header('Cache-Control', 'no-store')
  @ApiOkResponse({ description: 'API dependency readiness status' })
  @ApiServiceUnavailableResponse({ description: 'A critical dependency is unavailable' })
  getReadiness(): Promise<HealthResponse> {
    return this.healthService.getReadiness();
  }
}
