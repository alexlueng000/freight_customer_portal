import { expect, test } from '@playwright/test';

for (const width of [1440, 390]) {
  test(`quote review fields and collapsible source work at ${width}px`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 1000 });
    let review = { validUntil: '2026-10-02', customerTerms: '', internalNote: '' };
    let unitPrice = '1300';
    let extraFees: Array<{ id: string; chargeCode: string; chargeName: string; chargeBasis: string; containerType: string | null; quantity: string; unitPrice: string; amount: string; costAmount: string | null; currency: string }> = [];
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
        review = { validUntil: body.validUntil, customerTerms: body.customerTerms, internalNote: body.internalNote };
        unitPrice = body.items[0].unitPrice;
        extraFees = body.items.slice(1).map((item: (typeof extraFees)[number] & { itemId?: string }, index: number) => ({
          ...item, id: item.itemId ?? 'fee-' + index, chargeCode: 'MANUAL_CHARGE', amount: String(Number(item.quantity) * Number(item.unitPrice)),
        }));
        return route.fulfill({ json: {} });
      }
      if (path.endsWith('/admin/quotes/layout-test')) return route.fulfill({ json: {
        quoteNo: 'QT202609000024', status: 'DRAFT', polCode: 'CNSHA', podCode: 'USLAX', carrierCode: 'COSCO', etd: '2026-09-20',
        currency: 'USD', totalAmount: String(Number(unitPrice) + extraFees.reduce((sum, item) => sum + Number(item.amount), 0)), containerQuantity: 1, incoterm: null, requestedServices: [], cargoItems: [],
        customer: { name: '测试客户' }, bookings: [], sentAt: null, sentBy: null, priceOverrideReason,
        sourceRate: { id: 'rate', rateNo: 'RATE-TEST', serviceName: '直达航线', supplierName: '测试供应商', contractNo: null,
          effectiveDate: '2026-09-01', expiryDate: '2026-10-02', transitDays: 18 },
        items: [{ id: 'ocean', chargeCode: 'OCEAN_FREIGHT', chargeName: '海运费', chargeBasis: 'PER_CONTAINER', containerType: '40HQ',
          quantity: '1', unitPrice, amount: unitPrice, costAmount: '900', currency: 'USD' }, ...extraFees], ...review,
      } });
      return route.fulfill({ json: [] });
    });
    await page.goto('/admin/quotes/layout-test');
    const fields = page.getByRole('region', { name: '报价编辑' });
    await expect(fields).toBeVisible();
    const terms = fields.getByLabel('客户可见报价条款', { exact: false });
    await expect(terms).toHaveValue(/海运费（按箱 \/ 40HQ）/);
    await fields.getByLabel('报价有效期至').fill('2026-10-01');
    await expect(terms).toHaveValue(/报价有效期至：2026-10-01/);
    await terms.fill('另行确认提货时间。');
    await fields.getByLabel('报价有效期至').fill('2026-10-02');
    await expect(terms).toHaveValue('另行确认提货时间。');
    await fields.getByRole('button', { name: '根据费用生成' }).click();
    await fields.getByRole('button', { name: '保留原文' }).click();
    await expect(terms).toHaveValue('另行确认提货时间。');
    await fields.getByRole('button', { name: '根据费用生成' }).click();
    await fields.getByRole('button', { name: '替换为生成内容' }).click();
    await expect(terms).toHaveValue(/报价有效期至：2026-10-02/);
    await fields.getByLabel('客户可见报价条款', { exact: false }).fill('不含目的港当地费用。');
    await fields.getByLabel('内部备注', { exact: false }).fill('待核实供应商费用。');
    await fields.getByRole('button', { name: '保存报价' }).click();
    await expect(fields.getByLabel('内部备注', { exact: false })).toHaveValue('待核实供应商费用。');
    await page.reload();
    await expect(fields.getByLabel('客户可见报价条款', { exact: false })).toHaveValue('不含目的港当地费用。');
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await fields.getByLabel('海运费销售单价（USD）').fill('1400');
    await fields.getByLabel('内部改价原因', { exact: false }).fill('内部采购成本调整');
    await fields.getByLabel('客户可见报价条款', { exact: false }).fill('包含新增提货服务；不含目的港当地费用。');
    await fields.getByRole('button', { name: '保存报价', exact: true }).click();
    await expect(fields.getByLabel('海运费销售单价（USD）')).toHaveValue('1400');
    await expect(fields.getByLabel('客户可见报价条款', { exact: false })).toHaveValue('包含新增提货服务；不含目的港当地费用。');
    await expect(page.getByText('测试供应商', { exact: true })).not.toBeVisible();
    await page.locator('summary').filter({ hasText: '运价来源与发送记录' }).click();
    await expect(page.getByText('测试供应商', { exact: true })).toBeVisible();
    await fields.getByRole('button', { name: '添加费用', exact: false }).click();
    await fields.getByLabel('第 2 行费用名称').fill('文件费');
    await fields.getByLabel('第 2 行计费方式').selectOption('PER_BL');
    await fields.getByLabel('文件费销售单价（USD）').fill('35');
    await fields.getByLabel('第 2 行成本单价').fill('20');
    await expect(terms).toHaveValue('包含新增提货服务；不含目的港当地费用。');
    await fields.getByRole('button', { name: '根据费用生成' }).click();
    await fields.getByRole('button', { name: '替换为生成内容' }).click();
    await expect(terms).toHaveValue(/文件费（按提单）/);
    await fields.getByLabel('内部改价原因', { exact: false }).fill('新增文件费用');
    await fields.getByRole('button', { name: '保存报价', exact: true }).click();
    await page.reload();
    await expect(fields.getByLabel('第 2 行费用名称')).toHaveValue('文件费');
    await expect(fields.getByText('USD 1,435.00', { exact: true })).toBeVisible();
    await fields.getByRole('button', { name: '删除文件费', exact: true }).click();
    await expect(fields.getByText('待删除：文件费')).toBeVisible();
    await fields.getByRole('button', { name: '撤销删除' }).click();
    await expect(fields.getByLabel('第 2 行费用名称')).toHaveValue('文件费');
    await fields.getByRole('button', { name: '删除文件费', exact: true }).click();
    await fields.getByLabel('内部改价原因', { exact: false }).fill('取消文件费用');
    await fields.getByRole('button', { name: '保存报价', exact: true }).click();
    await expect(fields.getByLabel('第 2 行费用名称')).toHaveCount(0);
    await fields.scrollIntoViewIfNeeded();
    await page.screenshot({ path: testInfo.outputPath('review-layout.png') });
  });
}
