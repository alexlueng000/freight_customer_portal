import { expect, test } from '@playwright/test';

for (const width of [1440, 390]) {
  test(`customer booking keeps SO and transport together at ${width}px`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 1000 });
    const booking = {
      id: 'b1', bookingNo: 'BOOK-PILOT', quoteId: 'q1', status: 'BOOKED',
      polCode: 'CNSHA', podCode: 'USLAX', carrierCode: 'TEST', etd: '2026-09-20',
      incoterm: 'FOB', requestedServices: ['EXPORT_CUSTOMS'], commodity: '测试货物',
      cargoItems: [], containerRequests: [{ id: 'c1', containerType: '40HQ', quantity: 1 }],
      shipments: [{ id: 's1', shipmentNo: 'SHP-PILOT', status: 'DEPARTED' }],
      quote: { quoteNo: 'QT-PILOT', currency: 'USD', totalAmount: '1300' },
    };
    let published = false;
    await page.route('**/api/v1/**', async (route) => {
      const path = new URL(route.request().url()).pathname;
      if (path.endsWith('/auth/refresh')) return route.fulfill({ json: {
        accessToken: 'ui-test-only', accessTokenExpiresIn: 900,
        user: { id: 'customer', tenantId: 'demo', tenantCode: 'DEMO', displayName: '测试客户',
          email: 'customer@example.test', userType: 'CUSTOMER', roles: ['CUSTOMER_ADMIN'],
          permissions: ['rate.search', 'quote.read', 'booking.read', 'shipment.read', 'document.read', 'invoice.read'] },
      } });
      if (path === '/api/v1/bookings/b1') return route.fulfill({ json: booking });
      if (path === '/api/v1/bookings/b1/so-records') return route.fulfill({ json: published ? [{
        id: 'so1', soNumber: 'SO-PILOT', version: 1, vessel: 'TEST VESSEL', voyage: 'V1', terminal: '测试码头',
        cyCutoffAt: '2026-09-18T08:00:00Z', siCutoffAt: '2026-09-17T08:00:00Z', vgmCutoffAt: null,
        document: { id: 'd1', originalFilename: 'pilot-so.pdf' },
      }] : [] });
      if (path === '/api/v1/bookings/b1/documents') return route.fulfill({ json: published ? [{
        id: 'd1', documentType: 'SO', originalFilename: 'pilot-so.pdf', version: 1,
      }] : [] });
      if (path === '/api/v1/documents/d1/download') return route.fulfill({ contentType: 'application/pdf', body: '%PDF-1.4 pilot test' });
      return route.fulfill({ json: [] });
    });
    await page.goto('/portal/bookings/b1');
    await expect(page.getByRole('heading', { name: 'BOOK-PILOT' })).toBeVisible();
    const progress = page.getByRole('region', { name: '业务进度' });
    await expect(progress.getByRole('listitem')).toHaveCount(3);
    await expect(progress.getByText('运输进展', { exact: true })).toHaveCount(2);
    await expect(page.getByRole('link', { name: /查看运输：SHP-PILOT/ })).toHaveAttribute('href', '/portal/shipments/s1');
    await expect(page.getByText('暂未收到货代发布的 SO。', { exact: false })).toBeVisible();
    await expect(page.getByRole('button', { name: /下载 SO/ })).toHaveCount(0);
    published = true;
    await page.reload();
    await expect(page.getByText('SO SO-PILOT · V1')).toBeVisible();
    await expect(page.getByText('截港（CY）：', { exact: false })).toBeVisible();
    await expect(page.getByRole('link', { name: '查看报价与服务条款 →' })).toHaveAttribute('href', '/portal/quotes/q1#service-terms');
    const download = page.waitForEvent('download');
    await page.getByRole('button', { name: /下载 SO：pilot-so.pdf/ }).click();
    expect((await download).suggestedFilename()).toBe('pilot-so.pdf');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await page.screenshot({ path: testInfo.outputPath('pilot-booking.png') });
  });
}

test('customer home and notification retry keep legacy billing out of the journey', async ({ page }) => {
  let failNotifications = true;
  const oldNotice = { id: 'n0', type: 'INVOICE_ISSUED', payload: { title: '旧账单通知', href: '/portal/billing/i1' }, readAt: null };
  const soNotice = { id: 'n1', type: 'SO_PUBLISHED', payload: { title: 'SO 已发布', href: '/portal/bookings/b1' }, readAt: null };
  await page.route('**/api/v1/**', async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith('/auth/refresh')) return route.fulfill({ json: {
      accessToken: 'ui-test-only', accessTokenExpiresIn: 900,
      user: { id: 'c', tenantId: 't', tenantCode: 'DEMO', displayName: '客户', userType: 'CUSTOMER',
        roles: ['CUSTOMER_ADMIN'], permissions: ['rate.search', 'quote.read', 'booking.read', 'shipment.read', 'document.read', 'invoice.read'] },
    } });
    if (path === '/api/v1/dashboard/portal') return route.fulfill({ json: {
      stats: { pendingQuotes: 0, actionBookings: 0, activeShipments: 0, issuedInvoices: 1, unreadNotifications: 2 },
      actions: [{ id: 'i1', type: 'INVOICE', href: '/portal/billing/i1', title: '旧账单待办' }],
      recentShipments: [], notifications: [oldNotice, soNotice],
    } });
    if (path === '/api/v1/notifications') return failNotifications
      ? route.fulfill({ status: 503, json: { message: 'Unavailable' } })
      : route.fulfill({ json: [oldNotice, soNotice] });
    return route.fulfill({ json: [] });
  });
  await page.goto('/portal');
  await expect(page.getByRole('heading', { name: '首页', exact: true })).toBeVisible();
  await expect(page.getByText('旧账单待办')).toHaveCount(0);
  await expect(page.getByText('旧账单通知')).toHaveCount(0);
  await expect(page.locator('a[href^="/portal/billing"]')).toHaveCount(0);
  await page.getByRole('button', { name: '通知', exact: true }).click();
  await expect(page.getByRole('dialog', { name: '通知' }).getByRole('alert')).toContainText('通知加载失败');
  failNotifications = false;
  await page.getByRole('button', { name: '重新加载通知' }).click();
  await expect(page.getByRole('dialog', { name: '通知' }).getByRole('link')).toHaveCount(1);
  await expect(page.getByRole('dialog', { name: '通知' }).getByRole('link')).toHaveAttribute('href', '/portal/bookings/b1');
});
