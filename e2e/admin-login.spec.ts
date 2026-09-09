import { expect, test } from '@playwright/test';

test('explains a customer account mismatch and allows retry with a sales account', async ({ page }) => {
  let logoutCount = 0;
  await page.route('**/api/v1/**', async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith('/auth/refresh')) return route.fulfill({ status: 204 });
    if (path.endsWith('/auth/logout')) {
      logoutCount += 1;
      return route.fulfill({ status: 204 });
    }
    if (path.endsWith('/auth/login')) {
      const customer = route.request().postDataJSON().email.startsWith('customer@');
      return route.fulfill({ json: {
        accessToken: 'ui-test-only', accessTokenExpiresIn: 900,
        user: { id: 'login-test', tenantId: 'tenant-test', tenantCode: 'DEMO', tenantName: 'Demo',
          tenantBrandName: 'Demo', email: customer ? 'customer@example.test' : 'sales@example.test',
          displayName: '测试用户', userType: customer ? 'CUSTOMER' : 'INTERNAL',
          roles: [customer ? 'CUSTOMER_ADMIN' : 'SALES'], permissions: ['quote.manage'] },
      } });
    }
    if (path.endsWith('/notifications')) return route.fulfill({ json: [] });
    return route.fulfill({ json: { items: [], pagination: { page: 1, pageSize: 20, total: 0, totalPages: 0 } } });
  });
  await page.goto('/admin/login?tenantCode=DEMO&next=%2Fadmin%2Fquotes');
  await page.getByLabel('邮箱', { exact: true }).fill('customer@example.test');
  await page.getByLabel('密码', { exact: true }).fill('test-only-password');
  await page.getByRole('button', { name: '登录运营后台' }).click();
  await expect(page.getByRole('alert').filter({ hasText: '这是客户账号' })).toBeVisible();
  await expect(page).toHaveURL(/\/admin\/login\?/);
  expect(logoutCount).toBe(1);
  await page.getByLabel('邮箱', { exact: true }).fill('sales@example.test');
  await page.getByRole('button', { name: '登录运营后台' }).click();
  await expect(page).toHaveURL(/\/admin\/quotes$/);
  await expect(page.getByRole('heading', { name: '员工登录' })).toHaveCount(0);
});

test('real sales account enters the operations dashboard', async ({ page }) => {
  test.skip(!process.env.E2E_SALES_PASSWORD, 'Set E2E_SALES_PASSWORD for persisted authentication');
  await page.goto('/admin/login?tenantCode=DEMO');
  await page.getByLabel('邮箱', { exact: true }).fill('sales@demo.freight.local');
  await page.getByLabel('密码', { exact: true }).fill(process.env.E2E_SALES_PASSWORD!);
  await page.getByRole('button', { name: '登录运营后台' }).click();
  await expect(page).toHaveURL(/\/admin$/);
  await expect(page.getByRole('heading', { name: '员工登录' })).toHaveCount(0);
});
