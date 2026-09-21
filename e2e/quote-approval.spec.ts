import { expect, test } from '@playwright/test';

test('administrator can reject, resubmit and approve a locked quote', async ({ page }) => {
  let reviewStatus = 'NONE';
  let status = 'DRAFT';
  let approvalNote: string | null = null;
  await page.route('**/api/v1/**', async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith('/auth/refresh')) return route.fulfill({ json: { accessToken: 'test-only', accessTokenExpiresIn: 900, user: {
      id: 'admin', tenantId: 'demo', tenantCode: 'DEMO', tenantName: 'Demo', tenantBrandName: 'Demo', displayName: '管理员', email: 'admin@example.test', userType: 'INTERNAL', roles: ['TENANT_ADMIN'], permissions: ['quote.manage'],
    } } });
    if (path.endsWith('/submit-review')) reviewStatus = 'PENDING';
    if (path.endsWith('/reject-review')) { reviewStatus = 'REJECTED'; approvalNote = route.request().postDataJSON().reason; }
    if (path.endsWith('/approve-and-send')) { reviewStatus = 'APPROVED'; status = 'SENT'; }
    if (path.endsWith('/admin/quotes/approval-test')) return route.fulfill({ json: {
      quoteNo: 'QT-APPROVAL', status, reviewStatus, approvalRequired: true, approvalNote,
      polCode: 'CNSHA', podCode: 'USLAX', carrierCode: 'COSCO', etd: null, validUntil: '2030-12-31', plannedSailingDate: null,
      currency: 'USD', totalAmount: '110', amountsByCurrency: { USD: '110' }, containerQuantity: 1, requestedServices: [], cargoItems: [],
      customerTerms: '包含海运费。', internalNote: '', customer: { id: 'customer', name: '测试客户' }, bookings: [], sourceRate: null,
      sentAt: status === 'SENT' ? '2026-09-21T00:00:00Z' : null, sentBy: null, priceOverrideReason: null,
      items: [{ id: 'ocean', chargeCode: 'OCEAN_FREIGHT', chargeName: '海运费', chargeBasis: 'PER_CONTAINER', containerType: '40HQ', quantity: '1', unitPrice: '110', amount: '110', costAmount: '100', currency: 'USD' }],
      pricing: { lines: [{ id: 'ocean', costTotal: '100', profit: '10', margin: '9.09' }], summaries: [{ currency: 'USD', cost: '100', sell: '110', profit: '10', missingCost: false, margin: '9.09' }] },
    } });
    return route.fulfill({ json: {} });
  });
  await page.goto('/admin/quotes/approval-test');
  await expect(page.getByRole('button', { name: '发布正式报价', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: '提交管理员审核' }).click();
  await expect(page.getByLabel('报价有效期至')).toBeDisabled();
  await expect(page.getByRole('button', { name: '添加费用', exact: false })).toHaveCount(0);
  await page.getByLabel('驳回原因').fill('请核实费用后重提');
  await page.getByRole('button', { name: '驳回修改' }).click();
  await expect(page.getByLabel('报价有效期至')).toBeEnabled();
  await expect(page.getByText('驳回原因：请核实费用后重提')).toBeVisible();
  await page.getByRole('button', { name: '提交管理员审核' }).click();
  await page.getByRole('button', { name: '审核通过并发布' }).click();
  await page.getByRole('button', { name: '确认发布', exact: true }).click();
  await expect(page.getByText('正式报价已发布', { exact: true })).toBeVisible();
  await expect(page.getByLabel('报价有效期至')).toBeDisabled();
  const profit = page.getByRole('region', { name: '利润概览' });
  await expect(profit.getByRole('cell', { name: 'USD 100.00', exact: true })).toBeVisible();
  await expect(profit.getByRole('cell', { name: '9.09%', exact: true })).toBeVisible();
});

test('quote-derived rate prefill omits sell price and creates a draft after confirmation', async ({ page }) => {
  let saved: Record<string, unknown> | null = null;
  await page.route('**/api/v1/**', async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname.endsWith('/auth/refresh')) return route.fulfill({ json: { accessToken: 'test-only', accessTokenExpiresIn: 900, user: {
      id: 'admin', tenantId: 'demo', tenantCode: 'DEMO', tenantName: 'Demo', tenantBrandName: 'Demo', displayName: '管理员', email: 'admin@example.test', userType: 'INTERNAL', roles: ['TENANT_ADMIN'], permissions: ['quote.manage', 'rate.read', 'rate.manage'],
    } } });
    if (url.pathname.endsWith('/rates/from-quote/source-quote')) {
      if (route.request().method() === 'POST') { saved = route.request().postDataJSON(); return route.fulfill({ json: { id: 'new-rate' } }); }
      return route.fulfill({ json: { rateNo: '', polCode: 'CNSHA', polName: 'Shanghai', podCode: 'USLAX', podName: 'Los Angeles', carrierCode: 'COSCO', serviceName: '', effectiveDate: '2026-09-21', expiryDate: '2030-12-31', etd: '', transitDays: '', supplierName: '', contractNo: '', currency: 'USD', status: 'DRAFT', prices: [{ containerType: '40HQ', costAmount: '900', sellAmount: '', currency: 'USD', remark: '' }], charges: [] } });
    }
    if (url.pathname.endsWith('/rates')) return route.fulfill({ json: { items: [], pagination: { page: 1, pageSize: 20, total: 0, totalPages: 0 } } });
    return route.fulfill({ json: {} });
  });
  await page.goto('/admin/rates?fromQuote=source-quote');
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await expect(dialog.locator('input[name="prices.0.sellAmount"]')).toHaveValue('');
  await expect(dialog.locator('input[name="prices.0.costAmount"]')).toHaveValue('900');
  await expect(dialog.locator('select[name="status"]')).toBeDisabled();
  await dialog.locator('input[name="rateNo"]').fill('NEW-RATE-001');
  await dialog.getByRole('button', { name: '保存运价', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  expect(saved).toMatchObject({ rateNo: 'NEW-RATE-001', status: 'DRAFT', prices: [expect.objectContaining({ costAmount: '900' })] });
  expect((saved as unknown as { prices: Record<string, unknown>[] }).prices[0]).not.toHaveProperty('sellAmount');
});
