import { expect, test } from '@playwright/test';

for (const width of [1440, 390]) {
  test(`port mapping search and retry at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    let fail = true;
    await page.route('**/api/v1/**', async (route) => {
      const path = new URL(route.request().url()).pathname;
      if (path.endsWith('/auth/refresh')) {
        await route.fulfill({ json: {
          accessToken: 'ui-test-only', accessTokenExpiresIn: 900,
          user: { id: 'staff', tenantId: 'tenant', tenantCode: 'DEMO', tenantName: '测试货代',
            email: 'staff@example.test', displayName: '管理员', userType: 'INTERNAL',
            roles: ['TENANT_ADMIN'], permissions: ['rate.read'] },
        } });
      } else if (path.endsWith('/rates/port-mappings')) {
        if (fail) { await route.fulfill({ status: 500, json: {} }); return; }
        await route.fulfill({ json: { items: [
          { code: 'CNSZX', chineseName: '深圳', englishName: 'Shenzhen',
            searchAliases: ['CNSZX', '深圳'], importAliases: ['CNSZX', '盐田', '蛇口'] },
          { code: 'USLAX', chineseName: '洛杉矶', englishName: 'Los Angeles',
            searchAliases: ['USLAX', 'LA'], importAliases: ['LAX'] },
        ] } });
      } else await route.fulfill({ json: { items: [], unreadCount: 0 } });
    });
    await page.goto('/admin/settings');
    await expect(page.getByText('港口映射加载失败，请重试。')).toBeVisible();
    fail = false;
    await page.getByRole('button', { name: '重试', exact: true }).click();
    await expect(page.getByRole('status')).toHaveText('显示 2 / 2 个港口');
    for (const keyword of ['盐田', 'shenzhen', 'cnszx']) {
      await page.getByLabel('搜索港口').fill(keyword);
      await expect(page.getByRole('status')).toHaveText('显示 1 / 2 个港口');
      await expect(page.getByText('深圳', { exact: true }).filter({ visible: true })).toBeVisible();
    }
    await page.getByLabel('搜索港口').fill('不存在');
    await expect(page.getByText('未找到匹配港口')).toBeVisible();
    await page.getByLabel('搜索港口').fill('');
    await expect(page.getByRole('status')).toHaveText('显示 2 / 2 个港口');
  });
}
