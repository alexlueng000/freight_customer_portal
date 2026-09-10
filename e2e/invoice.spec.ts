import { expect, test } from '@playwright/test';

// Invoice business rules remain covered by API integration tests; pilot UI is deliberately closed.
for (const area of ['admin', 'portal'] as const) {
  test(`${area} invoice deep link explains pilot scope without loading invoices`, async ({ page }) => {
    const businessRequests: string[] = [];
    await page.route('**/api/v1/**', async (route) => {
      const path = new URL(route.request().url()).pathname;
      if (path.endsWith('/auth/refresh')) return route.fulfill({ json: {
        accessToken: 'ui-test-only', accessTokenExpiresIn: 900,
        user: { id: 'scope-test', tenantId: 'demo', tenantCode: 'DEMO', displayName: '测试用户',
          email: 'scope@example.test', userType: area === 'portal' ? 'CUSTOMER' : 'INTERNAL',
          roles: [area === 'portal' ? 'CUSTOMER_ADMIN' : 'TENANT_ADMIN'], permissions: ['invoice.read', 'document.read'] },
      } });
      if (path.includes('/invoices')) businessRequests.push(path);
      return route.fulfill({ json: [] });
    });
    for (const path of [area === 'portal' ? '/portal/billing/legacy-id' : '/admin/invoices/legacy-id', `/${area}/documents`]) {
      await page.goto(path);
      await expect(page.getByRole('heading', { name: '此功能暂未开放' })).toBeVisible();
      await expect(page.getByRole('link', { name: '返回首页', exact: true })).toHaveAttribute('href', `/${area}`);
    }
    expect(businessRequests).toEqual([]);
  });
}
