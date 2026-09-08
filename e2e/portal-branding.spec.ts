import { expect, test } from '@playwright/test';

const portalSlug = process.env.E2E_PORTAL_SLUG ?? 'demo';
const customerEmail = process.env.E2E_CUSTOMER_EMAIL ?? 'customer@demo.freight.local';
const customerPassword = process.env.E2E_CUSTOMER_PASSWORD;

test.describe('Tenant branded customer entry', () => {
  test('shows tenant branding and routes rate search through login', async ({ page }) => {
    await page.goto(`/t/${portalSlug}`);
    await expect(page.getByRole('heading', { name: '让国际物流更简单' })).toBeVisible();
    await expect(page.getByText('Northstar Freight').first()).toBeVisible();
    await page.getByRole('link', { name: '查询运价' }).click();
    await expect(page).toHaveURL(new RegExp(`/t/${portalSlug}\\?login=1&next=%2Fportal%2Frates$`));
    await expect(page.getByRole('dialog', { name: '客户登录' })).toBeVisible();
    await expect(page.getByLabel('租户代码')).toHaveCount(0);
  });

  test('keeps a safe deep link after customer login', async ({ page }) => {
    test.skip(!customerPassword, 'Set E2E_CUSTOMER_PASSWORD');
    await page.goto(`/t/${portalSlug}/login?next=/portal/bookings`);
    await page.getByLabel('邮箱').fill(customerEmail);
    await page.getByLabel('密码').fill(customerPassword!);
    await page.getByRole('button', { name: '登录客户中心' }).click();
    await expect(page).toHaveURL(/\/portal\/bookings$/);
  });

  test('does not expose unknown tenant branding', async ({ page }) => {
    await page.goto('/t/unknown-tenant');
    await expect(page.getByRole('heading', { name: '客户门户暂不可用' })).toBeVisible();
  });
});
