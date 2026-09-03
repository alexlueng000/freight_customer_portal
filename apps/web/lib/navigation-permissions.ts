export const navigationPermissions = {
  '/portal/rates': ['rate.search'],
  '/portal/quotes': ['quote.read'],
  '/portal/bookings': ['booking.read'],
  '/portal/shipments': ['shipment.read'],
  '/portal/documents': ['document.read'],
  '/portal/billing': ['invoice.read'],
  '/portal/company': ['customer.read'],
  '/portal/users': ['customer_user.read'],
  '/admin/customers': ['customer.read'],
  '/admin/rates': ['rate.read'],
  '/admin/quotes': ['quote.manage'],
  '/admin/bookings': ['booking.read'],
  '/admin/shipments': ['shipment.read'],
  '/admin/documents': ['document.read'],
  '/admin/invoices': ['invoice.read'],
  '/admin/users': ['user.read'],
  '/admin/audit-logs': ['audit.read'],
  '/admin/settings': ['tenant.manage'],
} as const satisfies Record<string, readonly string[]>;

export type PermissionAwareItem = {
  href: string;
  requiredPermissions?: readonly string[];
};

export type PermissionAwareGroup<TItem extends PermissionAwareItem> = {
  items: TItem[];
};

export function filterNavigationGroups<
  TItem extends PermissionAwareItem,
  TGroup extends PermissionAwareGroup<TItem>,
>(groups: TGroup[], permissions: readonly string[]): TGroup[] {
  const granted = new Set(permissions);

  return groups
    .map((group) => ({
      ...group,
      items: group.items.filter(
        (item) => item.requiredPermissions?.every((permission) => granted.has(permission)) ?? true,
      ),
    }))
    .filter((group) => group.items.length > 0);
}

export function requiredPermissionsForPath(pathname: string): readonly string[] {
  const matchingPath = Object.keys(navigationPermissions)
    .sort((left, right) => right.length - left.length)
    .find((path) => pathname === path || pathname.startsWith(`${path}/`));

  return matchingPath
    ? navigationPermissions[matchingPath as keyof typeof navigationPermissions]
    : [];
}

export function canAccessPath(pathname: string, permissions: readonly string[]): boolean {
  const granted = new Set(permissions);
  return requiredPermissionsForPath(pathname).every((permission) => granted.has(permission));
}
