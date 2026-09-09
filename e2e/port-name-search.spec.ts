import { expect, test } from '@playwright/test';

// UI contract test; persisted search/tenant isolation is covered by the API integration suite.
for (const viewport of [{ width: 1440, height: 960 }, { width: 390, height: 844 }]) {
  test(`searches using place names and shows Chinese routes at ${viewport.width}px`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.route('**/api/v1/**', async (route) => {
      const url = new URL(route.request().url());
      if (url.pathname.endsWith('/auth/refresh')) {
        await route.fulfill({ json: {
          accessToken: 'ui-test-only', accessTokenExpiresIn: 900,
          user: { id: 'ui-customer', tenantId: 'ui-tenant', tenantCode: 'DEMO',
            tenantName: '测试货代', tenantBrandName: '测试货代', portalSlug: 'demo',
            customerCompanyId: 'ui-company', email: 'ui@example.test', displayName: '测试客户',
            userType: 'CUSTOMER', roles: ['CUSTOMER_ADMIN'], permissions: ['rate.search', 'quote.create'] },
        } });
      } else if (url.pathname.endsWith('/portal/rates')) {
        const empty = url.searchParams.get('pol') === '不存在的港口';
        await route.fulfill({ json: {
          items: empty ? [] : [{ id: 'ui-rate', polCode: 'CNSZX', polName: 'Shenzhen', polDisplayName: '深圳',
            podCode: 'USLAX', podName: 'Los Angeles', podDisplayName: '洛杉矶', carrierCode: 'COSCO',
            serviceName: '测试航线', effectiveDate: '2026-09-01', expiryDate: '2026-12-31',
            etd: '2026-09-20', transitDays: 18, containerType: '40HQ', oceanSellAmount: '1100',
            sellAmount: '1100', charges: [], currency: 'USD' }],
          pagination: { page: 1, pageSize: 5, total: empty ? 0 : 1, totalPages: empty ? 0 : 1 },
        } });
      } else {
        await route.fulfill({ json: [] });
      }
    });
    await page.goto('/portal/rates');
    await expect(page.getByRole('heading', { name: '运价查询', exact: true })).toBeVisible();
    await page.getByLabel('起运地 / 港口（可选）').fill('深圳');
    await page.getByLabel('目的地 / 港口（可选）').fill('洛杉矶');
    const searchRequest = page.waitForRequest((request) => {
      const url = new URL(request.url());
      return url.pathname.endsWith('/portal/rates') && url.searchParams.get('pol') === '深圳' && url.searchParams.get('pod') === '洛杉矶';
    });
    await page.getByRole('button', { name: '筛选运价' }).click();
    await searchRequest;
    await expect(page.getByText('深圳 → 洛杉矶', { exact: true }).filter({ visible: true })).toBeVisible();
    await expect(page.getByText('CNSZX → USLAX', { exact: true }).filter({ visible: true })).toBeVisible();
    await page.getByRole('button', { name: '获取正式报价', exact: true }).filter({ visible: true }).click();
    await expect(page.getByRole('dialog').getByText('深圳 → 洛杉矶', { exact: true })).toBeVisible();
    const estimate = page.getByRole('region', { name: '费用预估', exact: true });
    await expect(estimate.getByText('已知费用小计', { exact: true })).toBeVisible();
    await expect(estimate.getByText('待销售报价', { exact: true })).toHaveCount(0);
    await page.getByRole('checkbox', { name: '起运地拖车 / 提货' }).check();
    await page.getByRole('checkbox', { name: '出口报关', exact: true }).check();
    await page.getByPlaceholder('城市 / 区域及详细提货地点').fill('大连');
    await expect(estimate.getByText('待销售报价', { exact: true })).toHaveCount(2);
    await expect(estimate.getByText('大连', { exact: true })).toBeVisible();
    await expect(estimate.getByText('待销售确认', { exact: true })).toBeVisible();
    await expect(estimate.getByText('已知费用小计', { exact: true }).locator('..')).toContainText('USD 1,100.00');
    await page.getByRole('checkbox', { name: '起运地拖车 / 提货' }).uncheck();
    await expect(estimate.getByText('大连', { exact: true })).toHaveCount(0);
    await expect(estimate.getByText('待销售报价', { exact: true })).toHaveCount(1);
    await page.getByRole('checkbox', { name: '出口报关', exact: true }).uncheck();
    await expect(estimate.getByText('待确认的服务费用', { exact: true })).toHaveCount(0);
    await page.getByRole('button', { name: '关闭报价申请' }).click();
    await page.getByLabel('起运地 / 港口（可选）').fill('不存在的港口');
    await page.getByRole('button', { name: '筛选运价' }).click();
    await expect(page.getByText('深圳 → 洛杉矶', { exact: true }).filter({ visible: true })).toHaveCount(0);
  });
}
