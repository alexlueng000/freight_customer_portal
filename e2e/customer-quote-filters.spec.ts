import { expect, test } from '@playwright/test';

for (const width of [1440, 390]) {
  test(`customer quote filters and Chinese routes at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 960 });
    await page.route('**/api/v1/**', async (route) => {
      const url = new URL(route.request().url());
      if (url.pathname.endsWith('/auth/refresh'))
        return route.fulfill({
          json: {
            accessToken: 'test-only',
            accessTokenExpiresIn: 900,
            user: {
              id: 'customer',
              tenantId: 'tenant',
              customerCompanyId: 'company',
              tenantCode: 'DEMO',
              tenantName: '测试货代',
              displayName: '客户',
              email: 'test@example.test',
              userType: 'CUSTOMER',
              roles: ['CUSTOMER_ADMIN'],
              permissions: ['quote.read', 'booking.create'],
            },
          },
        });
      if (url.pathname.endsWith('/quotes')) {
        const empty = url.searchParams.get('quoteNo') === 'NONE';
        return route.fulfill({
          json: {
            items: empty
              ? []
              : [
                  {
                    id: 'q1',
                    quoteNo: 'QT-ONE',
                    polCode: 'CNXMN',
                    podCode: 'THBKK',
                    polDisplayName: '厦门',
                    podDisplayName: '曼谷',
                    status: 'ACCEPTED',
                    carrierCode: 'SITC',
                    etd: '2026-09-22',
                    validUntil: '2026-10-01',
                    sentAt: '2026-09-21',
                    totalAmount: '540',
                    currency: 'USD',
                  },
                ],
            pagination: {
              page: Number(url.searchParams.get('page')),
              total: empty ? 0 : 21,
              totalPages: empty ? 0 : 2,
            },
          },
        });
      }
      return route.fulfill({ json: [] });
    });
    await page.goto('/portal/quotes');
    await expect(
      page.getByText('厦门 → 曼谷', { exact: true }).filter({ visible: true }),
    ).toBeVisible();
    await expect(
      page.getByText('CNXMN → THBKK', { exact: true }).filter({ visible: true }),
    ).toBeVisible();
    await page.getByRole('button', { name: '下一页' }).click();
    await expect(page.getByText('第 2 / 2 页')).toBeVisible();
    await page.getByLabel('起运港', { exact: true }).fill('厦门');
    await page.getByLabel('目的港', { exact: true }).fill('曼谷');
    await page.getByLabel('船司', { exact: true }).fill('SITC');
    await page.getByLabel('状态', { exact: true }).selectOption('pending');
    const request = page.waitForRequest((req) => {
      const url = new URL(req.url());
      return (
        url.pathname.endsWith('/quotes') &&
        url.searchParams.get('pol') === '厦门' &&
        url.searchParams.get('pod') === '曼谷' &&
        url.searchParams.get('carrierCode') === 'SITC' &&
        url.searchParams.get('statuses') === 'SENT,VIEWED,ACCEPTED' &&
        url.searchParams.get('page') === '1'
      );
    });
    await page.getByRole('button', { name: '查询', exact: true }).click();
    await request;
    await expect(page.getByText('第 1 / 2 页')).toBeVisible();
    await page.getByLabel('报价编号', { exact: true }).fill('NONE');
    await page.getByRole('button', { name: '查询', exact: true }).click();
    await expect(page.getByText('没有符合条件的报价')).toBeVisible();
    await page.getByRole('button', { name: '重置', exact: true }).click();
    await expect(page.getByLabel('报价编号', { exact: true })).toHaveValue('');
    await expect(
      page.getByText('厦门 → 曼谷', { exact: true }).filter({ visible: true }),
    ).toBeVisible();
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);
  });
}
