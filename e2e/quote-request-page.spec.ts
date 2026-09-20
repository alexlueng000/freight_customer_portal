import { expect, test, type Page } from '@playwright/test';

const requestUrl = '/portal/rates/rate-1/quote-request?containerType=40HQ';
const rate = {
  id: 'rate-1', polCode: 'CNSHA', podCode: 'USLAX', polName: '上海', podName: '洛杉矶',
  carrierCode: 'PIL', serviceName: null, effectiveDate: '2026-09-01', expiryDate: '2026-10-30',
  etd: '2026-10-02T00:00:00.000Z', transitDays: 18, containerType: '40HQ',
  oceanSellAmount: '1100', sellAmount: '1100', charges: [], currency: 'USD',
};

async function mockApi(page: Page, options: { canCreate?: boolean; unavailable?: boolean; failLoad?: boolean; recurring?: boolean } = {}) {
  const requests: Array<Record<string, unknown>> = [];
  let rejectSubmit = false;
  let failLoad = options.failLoad ?? false;
  await page.route('**/api/v1/**', async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname.endsWith('/auth/refresh')) return route.fulfill({ json: {
      accessToken: 'ui-test-only', accessTokenExpiresIn: 900,
      user: { id: 'customer', tenantId: 'tenant', tenantCode: 'DEMO', tenantName: '测试货代',
        customerCompanyId: 'company', displayName: '客户', email: 'customer@example.test',
        userType: 'CUSTOMER', roles: ['CUSTOMER_USER'],
        permissions: ['rate.search', 'quote.read', ...(options.canCreate === false ? [] : ['quote.create'])] },
    } });
    if (url.pathname.endsWith('/portal/rates')) {
      if (failLoad) return route.fulfill({ status: 500, json: {} });
      return route.fulfill({ json: { items: options.unavailable ? [] : [{ ...rate, ...(options.recurring ? { etd: null, sailingPattern: '每周五' } : {}) }], pagination: { page: 1, pageSize: 5, total: 1, totalPages: 1 } } });
    }
    if (url.pathname.endsWith('/quotes') && route.request().method() === 'POST') {
      requests.push(route.request().postDataJSON() as Record<string, unknown>);
      if (rejectSubmit) return route.fulfill({ status: 400, json: { code: 'VALIDATION_ERROR', details: { fieldErrors: {
        pickupLocationText: ['pickupLocationText 请补充提货地点。'], deliveryLocationText: ['deliveryLocationText 请补充派送地点。'],
        factoryLoadingDate: ['factoryLoadingDate 请选择有效的工厂预计装货日期。'],
      } } } });
      return route.fulfill({ json: { id: 'created-quote' } });
    }
    if (url.pathname.endsWith('/quotes/created-quote')) return route.fulfill({ status: 404, json: { message: '测试仅验证提交跳转' } });
    return route.fulfill({ json: { items: [], unreadCount: 0 } });
  });
  return { requests, allowLoad: () => { failLoad = false; }, rejectSubmission: () => { rejectSubmit = true; } };
}

for (const width of [1440, 390]) {
  test(`standalone request validates locations and submits a separate loading date at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 960 });
    const api = await mockApi(page);
    await page.goto('/portal/rates');
    await page.getByRole('button', { name: '筛选运价' }).click();
    await page.getByRole('button', { name: '获取正式报价', exact: true }).filter({ visible: true }).click();
    await expect(page).toHaveURL(/\/rates\/rate-1\/quote-request\?/);
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await page.reload();
    const form = page.getByRole('region', { name: '报价申请', exact: true });
    await expect(form).toBeVisible();
    await form.getByLabel('工厂预计装货日期', { exact: false }).fill('2026-09-25');
    const warning = page.locator('#factory-loading-date-warning');
    await expect(warning).toHaveCount(0);
    await form.getByLabel('工厂预计装货日期', { exact: false }).fill('2026-10-03');
    await expect(warning).toContainText('预计装货日期晚于本航次开船日（2026-10-02）');
    await form.getByLabel('工厂预计装货日期', { exact: false }).fill('2026-10-02');
    await expect(warning).toHaveCount(0);
    await form.getByLabel('工厂预计装货日期', { exact: false }).fill('');
    await expect(warning).toHaveCount(0);
    await form.getByLabel('工厂预计装货日期', { exact: false }).fill('2026-10-03');
    await form.getByLabel('货物品名', { exact: false }).fill('家具');
    await form.getByRole('checkbox', { name: '起运地拖车 / 提货' }).check();
    await form.getByRole('checkbox', { name: '目的地派送' }).check();
    await form.getByLabel('提货地点', { exact: false }).fill('   ');
    await form.getByLabel('派送地点', { exact: false }).fill('   ');
    await form.getByRole('button', { name: '提交报价需求' }).click();
    await expect(form.getByText('请填写提货地点。', { exact: true })).toBeVisible();
    await expect(form.getByText('请填写派送地点。', { exact: true })).toBeVisible();
    expect(api.requests).toHaveLength(0);
    await form.getByLabel('提货地点', { exact: false }).fill('  上海工厂  ');
    await form.getByLabel('派送地点', { exact: false }).fill('  洛杉矶仓库  ');
    await page.screenshot({ path: `test-results/quote-request-${width}.png`, fullPage: true });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await form.getByRole('button', { name: '提交报价需求' }).click();
    await expect(page.getByRole('dialog', { name: '确认提交报价申请' })).toBeVisible();
    expect(api.requests).toHaveLength(0);
    await page.getByRole('button', { name: '返回修改', exact: true }).click();
    await expect(form.getByLabel('提货地点', { exact: false })).toHaveValue('  上海工厂  ');
    await form.getByRole('button', { name: '提交报价需求' }).click();
    await page.getByRole('button', { name: '确认提交', exact: true }).click();
    await expect(page).toHaveURL('/portal/quotes/created-quote');
    expect(api.requests).toHaveLength(1);
    expect(api.requests[0]).toMatchObject({ factoryLoadingDate: '2026-10-03', pickupLocationText: '上海工厂', deliveryLocationText: '洛杉矶仓库' });
    expect(api.requests[0]).not.toHaveProperty('etd');
  });
}

test('recurring sailings do not invent an ETD for the loading date warning', async ({ page }) => {
  await mockApi(page, { recurring: true });
  await page.goto(requestUrl);
  await page.getByLabel('工厂预计装货日期', { exact: false }).fill('2027-01-01');
  await expect(page.getByText('每周五', { exact: true })).toBeVisible();
  await expect(page.locator('#factory-loading-date-warning')).toHaveCount(0);
});

test('locations remain required and retain values when services are deselected', async ({ page }) => {
  const api = await mockApi(page);
  await page.goto(requestUrl);
  await page.getByLabel('货物品名', { exact: false }).fill('家具');
  const checkbox = page.getByRole('checkbox', { name: '起运地拖车 / 提货' });
  await checkbox.check();
  await page.getByLabel('提货地点', { exact: false }).fill('旧地址');
  await checkbox.uncheck();
  await expect(page.getByLabel('提货地点', { exact: false })).toHaveValue('旧地址');
  await page.getByLabel('派送地点', { exact: false }).fill('目的地仓库');
  await page.getByRole('button', { name: '提交报价需求' }).click();
  await page.getByRole('button', { name: '确认提交', exact: true }).click();
  await expect(page).toHaveURL('/portal/quotes/created-quote');
  expect(api.requests[0]).toMatchObject({ requestedServices: [] });
  expect(api.requests[0]).not.toHaveProperty('factoryLoadingDate');
  expect(api.requests[0]).toMatchObject({ pickupLocationText: '旧地址', deliveryLocationText: '目的地仓库' });
});

test('server field errors appear beside fields and retain input', async ({ page }) => {
  const api = await mockApi(page);
  api.rejectSubmission();
  await page.goto(requestUrl);
  await page.getByLabel('货物品名', { exact: false }).fill('家具');
  await page.getByLabel('工厂预计装货日期', { exact: false }).fill('2026-09-25');
  await page.getByRole('checkbox', { name: '起运地拖车 / 提货' }).check();
  await page.getByRole('checkbox', { name: '目的地派送' }).check();
  await page.getByLabel('提货地点', { exact: false }).fill('上海工厂');
  await page.getByLabel('派送地点', { exact: false }).fill('洛杉矶仓库');
  await page.getByRole('button', { name: '提交报价需求' }).click();
  await page.getByRole('button', { name: '确认提交', exact: true }).click();
  await expect(page.getByRole('alert').filter({ hasText: '请补充提货地点。' })).toBeVisible();
  await expect(page.getByRole('alert').filter({ hasText: '请补充派送地点。' })).toBeVisible();
  await expect(page.getByRole('alert').filter({ hasText: '请选择有效的工厂预计装货日期。' })).toBeVisible();
  await expect(page.getByLabel('工厂预计装货日期', { exact: false })).toHaveValue('2026-09-25');
});

test('rate loading can retry and unavailable rates cannot be submitted', async ({ page }) => {
  const api = await mockApi(page, { failLoad: true });
  await page.goto(requestUrl);
  await expect(page.getByText('运价加载失败，请重试。')).toBeVisible();
  api.allowLoad();
  await page.getByRole('button', { name: '重试', exact: true }).click();
  await expect(page.getByRole('region', { name: '报价申请', exact: true })).toBeVisible();
  await page.unrouteAll();
  await mockApi(page, { unavailable: true });
  await page.reload();
  await expect(page.getByText('该运价暂不可用', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: '提交报价需求' })).toHaveCount(0);
});

test('direct request page access requires quote creation permission', async ({ page }) => {
  await mockApi(page, { canCreate: false });
  await page.goto(requestUrl);
  await expect(page.getByRole('region', { name: '报价申请', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: '提交报价需求' })).toHaveCount(0);
  await expect(page.getByText('权限不足', { exact: false }).first()).toBeVisible();
});
