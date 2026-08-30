import { expect, test, type Page } from '@playwright/test';

const tenantCode = process.env.E2E_TENANT_CODE ?? 'DEMO';
const adminEmail = process.env.E2E_ADMIN_EMAIL ?? 'admin@demo.freight.local';
const customerEmail = process.env.E2E_CUSTOMER_EMAIL ?? 'customer@demo.freight.local';
const adminPassword = process.env.E2E_ADMIN_PASSWORD;
const customerPassword = process.env.E2E_CUSTOMER_PASSWORD;

async function login(page: Page, email: string, password: string, expectedPath: string) {
  await page.goto('/login');
  await page.getByLabel('租户代码').fill(tenantCode);
  await page.getByLabel('邮箱').fill(email);
  await page.getByLabel('密码').fill(password);
  await page.getByRole('button', { name: '登录' }).click();
  await expect(page).toHaveURL(new RegExp(`${expectedPath}$`), { timeout: 15_000 });
}

test.describe('Invoice billing', () => {
  test.skip(
    !adminPassword || !customerPassword,
    'Set E2E_ADMIN_PASSWORD and E2E_CUSTOMER_PASSWORD',
  );

  test('internal user can view Invoice and access finance actions', async ({ page }) => {
    await login(page, adminEmail, adminPassword!, '/admin');
    await page.goto('/admin/invoices');
    await expect(page.getByRole('heading', { name: '应收账单' })).toBeVisible();
    await expect(page.getByRole('heading', { name: '新建 Draft Invoice' })).toBeVisible();
    await page.getByRole('link', { name: 'INV-DEMO-ISSUED' }).click();
    await expect(page.getByRole('heading', { name: 'INV-DEMO-ISSUED' })).toBeVisible();
    await expect(page.getByText('OCEAN_FREIGHT')).toBeVisible();
    await expect(page.getByRole('button', { name: '标记已收款' })).toBeVisible();
    await expect(page.getByRole('button', { name: '作废' })).toBeVisible();
  });

  test('customer sees only the issued billing view and confirm action', async ({ page }) => {
    await login(page, customerEmail, customerPassword!, '/portal');
    await page.goto('/portal/billing');
    await expect(page.getByRole('heading', { name: '账单' })).toBeVisible();
    await page.getByRole('link', { name: 'INV-DEMO-ISSUED' }).click();
    await expect(page.getByRole('heading', { name: 'INV-DEMO-ISSUED' })).toBeVisible();
    await expect(page.getByRole('button', { name: '确认账单' })).toBeVisible();
    await expect(page.getByRole('button', { name: '标记已收款' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: '作废' })).toHaveCount(0);
    await expect(page.getByRole('heading', { name: '新建 Draft Invoice' })).toHaveCount(0);
  });
});
