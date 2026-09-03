import { expect, test, type APIRequestContext, type Browser, type Page } from '@playwright/test';

const apiPort = process.env.E2E_API_PORT ?? '4000';
const apiBase = process.env.E2E_API_URL ?? `http://127.0.0.1:${apiPort}/api/v1`;
const tenantCode = process.env.E2E_TENANT_CODE ?? 'DEMO';
const adminPassword = process.env.E2E_ADMIN_PASSWORD;
const customerPassword = process.env.E2E_CUSTOMER_PASSWORD;

const internalRoles = [
  {
    email: 'admin@demo.freight.local',
    name: 'tenant admin',
    navigation: [
      '仪表盘',
      '客户',
      '运价',
      '报价',
      '订舱',
      '出运',
      '单证',
      '发票',
      '用户',
      '审计日志',
      '设置',
    ],
  },
  {
    email: 'sales@demo.freight.local',
    name: 'sales',
    navigation: ['仪表盘', '客户', '运价', '报价', '订舱', '出运', '单证', '发票'],
  },
  {
    email: 'operation@demo.freight.local',
    name: 'operation',
    navigation: ['仪表盘', '客户', '订舱', '出运', '单证'],
  },
  {
    email: 'finance@demo.freight.local',
    name: 'finance',
    navigation: ['仪表盘', '客户', '出运', '单证', '发票'],
  },
] as const;

const customerRoles = [
  {
    email: 'customer@demo.freight.local',
    name: 'customer admin',
    navigation: ['仪表盘', '运价', '报价', '订舱', '出运', '单证', '账单', '公司资料', '用户'],
  },
  {
    email: 'customer-user@demo.freight.local',
    name: 'customer user',
    navigation: ['仪表盘', '运价', '报价', '订舱', '出运', '单证', '账单', '公司资料'],
  },
] as const;

test.describe('Role permissions', () => {
  test.skip(
    !adminPassword || !customerPassword,
    'Set E2E_ADMIN_PASSWORD and E2E_CUSTOMER_PASSWORD',
  );

  test('renders the permitted navigation for every demo role', async ({ browser }) => {
    for (const role of internalRoles) {
      await expectNavigation(browser, role.email, adminPassword!, '/admin', role.navigation);
    }
    for (const role of customerRoles) {
      await expectNavigation(browser, role.email, customerPassword!, '/portal', role.navigation);
    }
  });

  test('keeps read-only roles from seeing mutation controls', async ({ browser }) => {
    const salesPage = await authenticatedPage(
      browser,
      'sales@demo.freight.local',
      adminPassword!,
      '/admin',
    );
    await salesPage.goto('/admin/invoices');
    await expect(salesPage.getByRole('heading', { name: '应收账单' })).toBeVisible();
    await expect(salesPage.getByRole('heading', { name: '新建 Draft Invoice' })).toHaveCount(0);
    await salesPage.getByRole('link', { name: 'INV-DEMO-ISSUED' }).click();
    await expect(salesPage.getByRole('button', { name: '标记已收款' })).toHaveCount(0);
    await expect(salesPage.getByRole('button', { name: '作废' })).toHaveCount(0);
    await salesPage.context().close();

    const financePage = await authenticatedPage(
      browser,
      'finance@demo.freight.local',
      adminPassword!,
      '/admin',
    );
    await financePage.goto('/admin/invoices');
    await expect(financePage.getByRole('heading', { name: '新建 Draft Invoice' })).toBeVisible();
    await financePage.context().close();

    const operationPage = await authenticatedPage(
      browser,
      'operation@demo.freight.local',
      adminPassword!,
      '/admin',
    );
    await operationPage.goto('/admin/shipments');
    await operationPage.getByRole('link', { name: 'SHP-DEMO-BOOKED' }).click();
    await expect(operationPage.getByRole('button', { name: '编辑航程计划' })).toBeVisible();
    await operationPage.context().close();
  });

  test('rejects forbidden mutations at the API boundary', async ({ request }) => {
    const salesToken = await loginApi(request, 'sales@demo.freight.local', adminPassword!);
    const financeToken = await loginApi(request, 'finance@demo.freight.local', adminPassword!);
    const operationToken = await loginApi(request, 'operation@demo.freight.local', adminPassword!);
    const customerToken = await loginApi(
      request,
      'customer-user@demo.freight.local',
      customerPassword!,
    );

    await expectForbidden(
      request.post(`${apiBase}/admin/invoices`, { headers: bearer(salesToken), data: {} }),
    );
    await expectForbidden(
      request.post(`${apiBase}/admin/quotes/not-authorized/send`, {
        headers: bearer(financeToken),
      }),
    );
    await expectForbidden(
      request.post(`${apiBase}/admin/invoices`, { headers: bearer(operationToken), data: {} }),
    );
    await expectForbidden(
      request.post(`${apiBase}/users`, { headers: bearer(customerToken), data: {} }),
    );
  });
});

async function expectNavigation(
  browser: Browser,
  email: string,
  password: string,
  expectedPath: '/admin' | '/portal',
  expectedItems: readonly string[],
) {
  const page = await authenticatedPage(browser, email, password, expectedPath);
  const items = await page.locator('aside nav').getByRole('link').allTextContents();
  expect(
    items.map((item) => item.trim()),
    email,
  ).toEqual(expectedItems);
  await page.context().close();
}

async function authenticatedPage(
  browser: Browser,
  email: string,
  password: string,
  expectedPath: '/admin' | '/portal',
): Promise<Page> {
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto('/login');
  await page.getByLabel('租户代码').fill(tenantCode);
  await page.getByLabel('邮箱').fill(email);
  await page.getByLabel('密码').fill(password);
  await page.getByRole('button', { name: '登录' }).click();
  await expect(page).toHaveURL(new RegExp(`${expectedPath}$`), { timeout: 15_000 });
  return page;
}

async function loginApi(request: APIRequestContext, email: string, password: string) {
  const response = await request.post(`${apiBase}/auth/login`, {
    data: { tenantCode, email, password },
  });
  expect(response.ok(), `login ${email}`).toBeTruthy();
  return ((await response.json()) as { accessToken: string }).accessToken;
}

async function expectForbidden(
  responsePromise: Promise<{ status(): number; json(): Promise<unknown> }>,
) {
  const response = await responsePromise;
  expect(response.status()).toBe(403);
  expect(await response.json()).toMatchObject({ code: 'PERMISSION_DENIED' });
}

const bearer = (token: string) => ({ authorization: `Bearer ${token}` });
