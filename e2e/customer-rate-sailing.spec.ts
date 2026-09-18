import { expect, test } from '@playwright/test';

for (const role of ['CUSTOMER_ADMIN', 'CUSTOMER_USER']) {
  for (const width of [1440, 390]) {
    test(`${role} sees sailing and validity at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 960 });
      const items = ['每周五', '每月15日', null].map((sailingPattern, index) => ({
        id: `rate-${index}`, polCode: 'CNSHA', polName: 'Shanghai', polDisplayName: '上海',
        podCode: 'USLAX', podName: 'Los Angeles', podDisplayName: '洛杉矶', carrierCode: 'PIL',
        serviceName: null, effectiveDate: '2026-09-05', expiryDate: '2026-09-25',
        etd: index === 2 ? '2026-09-15T00:00:00.000Z' : null, sailingPattern,
        transitDays: 18, containerType: '40HQ', oceanSellAmount: '1100', sellAmount: '1100', charges: [], currency: 'USD',
      }));
      await page.route('**/api/v1/**', async (route) => {
        const path = new URL(route.request().url()).pathname;
        if (path.endsWith('/auth/refresh')) await route.fulfill({ json: {
          accessToken: 'ui-test-only', accessTokenExpiresIn: 900,
          user: { id: 'customer', tenantId: 'tenant', tenantCode: 'DEMO', tenantName: '测试货代',
            customerCompanyId: 'company', displayName: '客户', email: 'customer@example.test',
            userType: 'CUSTOMER', roles: [role], permissions: ['rate.search', 'quote.create'] },
        } });
        else if (path.endsWith('/portal/rates')) await route.fulfill({ json: { items,
          pagination: { page: 1, pageSize: 5, total: 3, totalPages: 1 } } });
        else await route.fulfill({ json: { items: [], unreadCount: 0 } });
      });
      await page.goto('/portal/rates');
      await page.getByRole('button', { name: '筛选运价' }).click();
      for (const label of ['每周五', '每月15日', '2026-09-15']) {
        await expect(page.getByText(label, { exact: width > 600 }).filter({ visible: true })).toHaveCount(1);
      }
      if (width > 600) {
        const rows = page.locator('tbody tr');
        await expect(rows).toHaveCount(3);
        for (let index = 0; index < 3; index += 1) {
          await expect(rows.nth(index)).toContainText('2026-09-05');
          await expect(rows.nth(index)).toContainText('2026-09-25');
        }
      } else {
        await expect(page.getByText('2026-09-05 至 2026-09-25', { exact: true }).filter({ visible: true })).toHaveCount(3);
      }
      await page.getByRole('button', { name: '获取正式报价', exact: true }).filter({ visible: true }).nth(1).click();
      const dialog = page.getByRole('dialog');
      await expect(dialog.getByText('开船日', { exact: true })).toBeVisible();
      await expect(dialog.getByText('每月15日', { exact: true })).toBeVisible();
      await expect(dialog.getByText('2026-09-05 至 2026-09-25', { exact: true })).toBeVisible();
    });
  }
}
