import { HealthService } from './health.service.js';

describe('HealthService', () => {
  it('returns API liveness status', () => {
    const service = new HealthService();

    expect(service.getHealth()).toMatchObject({
      status: 'ok',
      service: 'api',
    });
  });
});
