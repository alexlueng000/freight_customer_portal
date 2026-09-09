import { expect, test } from '@playwright/test';

for (const width of [1440, 390]) {
  test(`quote review fields and collapsible source work at ${width}px`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 1000 });
    let review = { validUntil: '2026-10-02', customerTerms: '', internalNote: '' };
    let priceOverrideReason: string | null = null;
    await page.route('**/api/v1/**', async (route) => {
      const path = new URL(route.request().url()).pathname;
      if (path.endsWith('/auth/refresh')) return route.fulfill({ json: {
        accessToken: 'ui-test-only', accessTokenExpiresIn: 900,
        user: { id: 'sales', tenantId: 'demo', tenantCode: 'DEMO', tenantName: 'Demo', tenantBrandName: 'Demo',
          displayName: '测试销售', email: 'sales@example.test', userType: 'INTERNAL', roles: ['SALES'], permissions: ['quote.manage'] },
      } });
      if (path.endsWith('/review')) {
        review = route.request().postDataJSON();
        return route.fulfill({ json: {} });
      }
      if (path.endsWith('/prices')) {
        const body = route.request().postDataJSON();
        priceOverrideReason = body.reason;
        review.customerTerms = body.customerTerms;
        return route.fulfill({ json: {} });
      }
      if (path.endsWith('/admin/quotes/layout-test')) return route.fulfill({ json: {
        quoteNo: 'QT202609000024', status: 'DRAFT', polCode: 'CNSHA', podCode: 'USLAX', carrierCode: 'COSCO', etd: '2026-09-20',
        currency: 'USD', totalAmount: '1300', containerQuantity: 1, incoterm: null, requestedServices: [], cargoItems: [],
        customer: { name: '测试客户' }, bookings: [], sentAt: null, sentBy: null, priceOverrideReason,
        sourceRate: { id: 'rate', rateNo: 'RATE-TEST', serviceName: '直达航线', supplierName: '测试供应商', contractNo: null,
          effectiveDate: '2026-09-01', expiryDate: '2026-10-02', transitDays: 18 },
        items: [{ id: 'ocean', chargeCode: 'OCEAN_FREIGHT', chargeName: '海运费', chargeBasis: 'PER_CONTAINER', containerType: '40HQ',
          quantity: '1', unitPrice: '1300', amount: '1300', costAmount: '900', currency: 'USD' }], ...review,
      } });
      return route.fulfill({ json: [] });
    });
    await page.goto('/admin/quotes/layout-test');
    const fields = page.getByRole('region', { name: '报价审核信息' });
    await expect(fields).toBeVisible();
    await fields.getByLabel('客户可见报价条款', { exact: false }).fill('不含目的港当地费用。');
    await fields.getByLabel('内部备注', { exact: false }).fill('待核实供应商费用。');
    await fields.getByRole('button', { name: '保存审核信息' }).click();
    await expect(fields.getByLabel('内部备注', { exact: false })).toHaveValue('待核实供应商费用。');
    await page.reload();
    await expect(fields.getByLabel('客户可见报价条款', { exact: false })).toHaveValue('不含目的港当地费用。');
    await page.getByRole('button', { name: '调整价格', exact: true }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog.getByLabel('客户可见报价说明与条款', { exact: false })).toHaveValue('不含目的港当地费用。');
    await dialog.getByLabel('内部改价原因', { exact: false }).fill('内部采购成本调整');
    await dialog.getByLabel('客户可见报价说明与条款', { exact: false }).fill('包含新增提货服务；不含目的港当地费用。');
    await dialog.getByRole('button', { name: '保存改价', exact: true }).click();
    await expect(dialog).toHaveCount(0);
    await expect(fields.getByLabel('客户可见报价条款', { exact: false })).toHaveValue('包含新增提货服务；不含目的港当地费用。');
    await expect(page.getByText('测试供应商', { exact: true })).not.toBeVisible();
    await page.locator('summary').filter({ hasText: '运价来源与发送记录' }).click();
    await expect(page.getByText('测试供应商', { exact: true })).toBeVisible();
    await fields.scrollIntoViewIfNeeded();
    await page.screenshot({ path: testInfo.outputPath('review-layout.png') });
  });
}
