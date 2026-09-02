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

test.describe('Shipment fulfillment', () => {
  test.skip(
    !adminPassword || !customerPassword,
    'Set E2E_ADMIN_PASSWORD and E2E_CUSTOMER_PASSWORD',
  );

  test('internal user can open the real Shipment list and maintenance detail', async ({ page }) => {
    await login(page, adminEmail, adminPassword!, '/admin');
    await page.goto('/admin/shipments');
    await expect(page.getByRole('heading', { name: 'Basic Shipment' })).toBeVisible();
    const firstShipment = page.getByRole('link', { name: 'SHP-DEMO-BOOKED' });
    await expect(firstShipment).toBeVisible();
    await firstShipment.click();
    await expect(page).toHaveURL(/\/admin\/shipments\/[^/]+$/);
    await expect(page.getByRole('heading', { name: /^SHP/ })).toBeVisible();
    await expect(page.getByRole('heading', { name: '运输进度' })).toBeVisible();
    await expect(page.getByRole('heading', { name: '航程计划' })).toBeVisible();
    await expect(page.getByRole('button', { name: '编辑航程计划' })).toBeVisible();
    await expect(page.getByRole('button', { name: '标记已开船' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Containers' })).toHaveCount(0);
    await expect(page.getByRole('heading', { name: '参考附件' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: '新增节点' })).toHaveCount(0);
  });

  test('customer user sees the scoped Shipment detail without maintenance controls', async ({
    page,
  }) => {
    await login(page, customerEmail, customerPassword!, '/portal');
    await page.goto('/portal/shipments');
    await expect(page.getByRole('heading', { name: 'Basic Shipment' })).toBeVisible();
    const firstShipment = page.getByRole('link', { name: 'SHP-DEMO-BOOKED' });
    await expect(firstShipment).toBeVisible();
    await firstShipment.click();
    await expect(page).toHaveURL(/\/portal\/shipments\/[^/]+$/);
    await expect(page.getByRole('heading', { name: /^SHP/ })).toBeVisible();
    await expect(page.getByRole('heading', { name: '运输进度' })).toBeVisible();
    await expect(page.getByText('待开船', { exact: true }).first()).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Containers' })).toHaveCount(0);
    await expect(page.getByRole('heading', { name: '参考附件' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: '保存资料' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: '新增 Container' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: '新增节点' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: '上传新版本' })).toHaveCount(0);
  });
});
