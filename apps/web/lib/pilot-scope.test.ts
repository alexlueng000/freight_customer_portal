import assert from 'node:assert/strict';
import test from 'node:test';
import { isPilotPathAvailable, isPilotNotificationAvailable } from './pilot-scope.ts';
import { filterNavigationGroups } from './navigation-permissions.ts';

void test('excludes deferred lists and deep links while preserving booking files and audit', () => {
  for (const path of ['/portal/billing', '/portal/billing/inv-1?tab=files', '/admin/invoices/', '/admin/documents/doc-1', '/portal/documents#files']) {
    assert.equal(isPilotPathAvailable(path), false, path);
  }
  for (const path of ['/portal/bookings/b1', '/api/v1/documents/d1/download', '/admin/audit-logs', '/portal/shipments/s1']) {
    assert.equal(isPilotPathAvailable(path), true, path);
  }
});

void test('permissions do not reopen deferred navigation and retained routes still require permission', () => {
  const groups = [{ items: [
    { href: '/admin/invoices', requiredPermissions: ['invoice.read'] },
    { href: '/admin/audit-logs', requiredPermissions: ['audit.read'] },
  ] }];
  assert.deepEqual(filterNavigationGroups(groups, ['invoice.read']), []);
  assert.deepEqual(filterNavigationGroups(groups, ['invoice.read', 'audit.read']), [{ items: [groups[0]!.items[1]!] }]);
});

void test('filters legacy notifications by type or deep link without hiding SO notices', () => {
  assert.equal(isPilotNotificationAvailable({ type: 'INVOICE_ISSUED', payload: {} }), false);
  assert.equal(isPilotNotificationAvailable({ type: 'CUSTOM', payload: { href: '/portal/billing/i1' } }), false);
  assert.equal(isPilotNotificationAvailable({ type: 'SO_PUBLISHED', payload: { href: '/portal/bookings/b1' } }), true);
});
