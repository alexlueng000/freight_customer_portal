import assert from 'node:assert/strict';
import test from 'node:test';
import { isSafePortalNextPath } from './portal-branding.ts';

void test('allows only local customer portal deep links', () => {
  assert.equal(isSafePortalNextPath('/portal'), true);
  assert.equal(isSafePortalNextPath('/portal/bookings/booking-id?tab=documents'), true);
  assert.equal(isSafePortalNextPath('/admin'), false);
  assert.equal(isSafePortalNextPath('//evil.example/portal'), false);
  assert.equal(isSafePortalNextPath('https://evil.example/portal'), false);
  assert.equal(isSafePortalNextPath(null), false);
});
