// Product availability only. Server-side permissions and file ACLs remain authoritative.
const deferredPaths = [
  '/portal/documents', '/portal/billing', '/admin/documents', '/admin/invoices',
];

export function isPilotPathAvailable(href: string): boolean {
  const pathname = href.split(/[?#]/, 1)[0]!.replace(/\/+$/, '');
  return !deferredPaths.some((path) => pathname === path || pathname.startsWith(`${path}/`));
}

export function isPilotNotificationAvailable(item: { type: string; payload: { href?: string } }): boolean {
  return !item.type.startsWith('INVOICE_') &&
    (!item.payload.href || isPilotPathAvailable(item.payload.href));
}
