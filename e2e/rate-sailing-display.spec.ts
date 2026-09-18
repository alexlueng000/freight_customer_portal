import { expect, test } from '@playwright/test';

for (const width of [1440, 390]) {
  test(`rate list sailing and imported validity at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    const items = [
      ['WEEKLY', null, '每周五', '2026-09-01', '2026-09-20'],
      ['MONTHLY', null, '每月15日', '2026-09-05', '2026-09-25'],
      ['EXACT', '2026-09-15T00:00:00.000Z', '2026年9月15日', '2026-09-01', '2026-09-20'],
      ['EMPTY', null, null, '2026-09-01', '2026-09-20'],
    ].map(([id, etd, schedule, effectiveDate, expiryDate]) => ({
      id, rateNo: id, polCode: 'CNSHA', podCode: 'USLAX', polName: 'Shanghai', podName: 'Los Angeles',
      polDisplayName: '上海', podDisplayName: '洛杉矶', carrierCode: 'PIL', serviceName: null,
      etd, effectiveDate, expiryDate, status: 'DRAFT', supplierName: null, contractNo: null,
      prices: ['20GP', '40HQ'].map((containerType) => ({ id: `${id}-${containerType}`, containerType,
        costAmount: '420', currency: 'USD', remark: schedule ? `Schedule: ${schedule} | Free time: 7天` : null })),
    }));
    await page.route('**/api/v1/**', async (route) => {
      const path = new URL(route.request().url()).pathname;
      if (path.endsWith('/auth/refresh')) {
        await route.fulfill({ json: { accessToken: 'ui-test-only', accessTokenExpiresIn: 900,
          user: { id: 'staff', tenantId: 'tenant', tenantCode: 'DEMO', tenantName: '测试货代',
            email: 'staff@example.test', displayName: '管理员', userType: 'INTERNAL',
            roles: ['TENANT_ADMIN'], permissions: ['rate.read'] } } });
      } else if (path.endsWith('/rates')) {
        await route.fulfill({ json: { items, pagination: { page: 1, pageSize: 20, total: 4, totalPages: 1 } } });
      } else await route.fulfill({ json: { items: [], unreadCount: 0 } });
    });
    await page.goto('/admin/rates');
    if (width > 600) {
      await expect(page.locator('thead th').filter({ hasText: '开船日' })).toBeVisible();
      const monthly = page.locator('tbody tr').filter({ hasText: 'MONTHLY' });
      await expect(monthly).toContainText('2026-09-05');
      await expect(monthly).toContainText('2026-09-25');
      await expect(monthly).toContainText('每月15日');
      await expect(page.locator('tbody tr').filter({ hasText: 'EMPTY' }).locator('td').nth(4)).toHaveText('—');
    }
    await expect(page.getByText('每周五', { exact: true }).filter({ visible: true })).toHaveCount(1);
    await expect(page.getByText('每月15日', { exact: true }).filter({ visible: true })).toHaveCount(1);
    await expect(page.getByText('2026-09-15', { exact: true }).filter({ visible: true })).toHaveCount(1);
  });
}
