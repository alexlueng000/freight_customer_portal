import assert from 'node:assert/strict';
import test from 'node:test';
import {
  canAccessPath,
  filterNavigationGroups,
  navigationPermissions,
  requiredPermissionsForPath,
} from './navigation-permissions.ts';

void test('filters inaccessible items and removes empty groups', () => {
  const groups = [
    {
      label: '商务',
      items: [
        {
          href: '/admin/customers',
          requiredPermissions: navigationPermissions['/admin/customers'],
        },
        { href: '/admin/rates', requiredPermissions: navigationPermissions['/admin/rates'] },
      ],
    },
    {
      label: '管理',
      items: [{ href: '/admin/users', requiredPermissions: navigationPermissions['/admin/users'] }],
    },
  ];

  assert.deepEqual(filterNavigationGroups(groups, ['rate.read']), [
    {
      label: '商务',
      items: [{ href: '/admin/rates', requiredPermissions: navigationPermissions['/admin/rates'] }],
    },
  ]);
});

void test('allows items without a permission requirement', () => {
  const groups = [{ label: '总览', items: [{ href: '/admin' }] }];
  assert.deepEqual(filterNavigationGroups(groups, []), groups);
});

void test('applies a navigation permission to nested routes', () => {
  assert.deepEqual(requiredPermissionsForPath('/admin/bookings/booking-id'), ['booking.read']);
  assert.equal(canAccessPath('/admin/bookings/booking-id', ['booking.read']), true);
  assert.equal(canAccessPath('/admin/bookings/booking-id', ['quote.read']), false);
});

void test('keeps dashboard and unknown routes unrestricted by navigation policy', () => {
  assert.equal(canAccessPath('/admin', []), true);
  assert.equal(canAccessPath('/admin/future-module', []), true);
});
