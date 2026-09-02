import { expect, test, type APIRequestContext, type APIResponse } from '@playwright/test';

const apiPort = process.env.E2E_API_PORT ?? '4000';
const apiBase = process.env.E2E_API_URL ?? `http://127.0.0.1:${apiPort}/api/v1`;
const webBase = process.env.E2E_BASE_URL ?? 'http://127.0.0.1:3000';
const tenantCode = process.env.E2E_TENANT_CODE ?? 'DEMO';
const adminEmail = process.env.E2E_ADMIN_EMAIL ?? 'admin@demo.freight.local';
const customerEmail = process.env.E2E_CUSTOMER_EMAIL ?? 'customer@demo.freight.local';
const adminPassword = process.env.E2E_ADMIN_PASSWORD;
const customerPassword = process.env.E2E_CUSTOMER_PASSWORD;

test.describe('Customer booking experience', () => {
  test.skip(
    !adminPassword || !customerPassword,
    'Set E2E_ADMIN_PASSWORD and E2E_CUSTOMER_PASSWORD',
  );

  test('inherits quote data and manages the scoped shipper address book', async ({
    browser,
    page,
    request,
  }) => {
    test.setTimeout(90_000);
    const adminToken = await login(request, adminEmail, adminPassword!);
    const customerToken = await login(request, customerEmail, customerPassword!);
    const run = Date.now().toString(36).toUpperCase();
    const now = new Date();

    const defaultShipper = await json<{ id: string }>(
      await request.post(`${apiBase}/bookings/shippers`, {
        headers: bearer(customerToken),
        data: { name: `默认发货人 ${run}`, address: '上海市浦东新区', isDefault: true },
      }),
      'create default shipper',
    );
    const alternateShipper = await json<{ id: string }>(
      await request.post(`${apiBase}/bookings/shippers`, {
        headers: bearer(customerToken),
        data: { name: `备用发货人 ${run}`, address: '宁波市北仑区' },
      }),
      'create alternate shipper',
    );
    const rate = await json<{ id: string }>(
      await request.post(`${apiBase}/rates`, {
        headers: bearer(adminToken),
        data: {
          rateNo: `BOOKING-UI-${run}`,
          polCode: 'CNSHA',
          polName: 'Shanghai',
          podCode: 'USLAX',
          podName: 'Los Angeles',
          carrierCode: 'E2E',
          serviceName: 'Booking UI',
          effectiveDate: dateOnly(now),
          expiryDate: dateOnly(addDays(now, 30)),
          etd: addDays(now, 7).toISOString(),
          transitDays: 18,
          supplierName: 'E2E Carrier',
          currency: 'USD',
          status: 'ACTIVE',
          prices: [
            {
              containerType: '40HQ',
              costAmount: '900.00',
              sellAmount: '1100.00',
              currency: 'USD',
            },
          ],
        },
      }),
      'create rate',
    );
    const quote = await json<{ id: string; quoteNo: string }>(
      await request.post(`${apiBase}/quotes`, {
        headers: bearer(customerToken),
        data: { rateId: rate.id, containerType: '40HQ', quantity: 2 },
      }),
      'create quote',
    );
    await ok(
      request.post(`${apiBase}/admin/quotes/${quote.id}/send`, { headers: bearer(adminToken) }),
      'send quote',
    );
    await ok(
      request.post(`${apiBase}/quotes/${quote.id}/accept`, { headers: bearer(customerToken) }),
      'accept quote',
    );
    const booking = await json<{ id: string }>(
      await request.post(`${apiBase}/bookings`, {
        headers: bearer(customerToken),
        data: { quoteId: quote.id },
      }),
      'create booking',
    );

    await browserLogin(page.context().request, customerEmail, customerPassword!);
    await page.goto(`/portal/bookings/${booking.id}`);

    await expect(page.getByRole('link', { name: new RegExp(quote.quoteNo) })).toBeVisible();
    await expect(page.getByText('2 × 40HQ')).toBeVisible();
    await expect(page.getByRole('textbox', { name: /^联系人 \*/ })).not.toHaveValue('');
    await expect(page.getByLabel('联系人邮箱')).toHaveValue(customerEmail);
    await expect(page.getByLabel('发货人名称')).toHaveValue(`默认发货人 ${run}`);
    await expect(page.getByText('SO 与 Shipment')).toHaveCount(0);

    await page.getByRole('button', { name: '提交订舱' }).click();
    await expect(page.getByText('请输入货物品名。')).toBeVisible();
    await expect(page.getByText('请选择包装类型。')).toBeVisible();
    await expect(page.getByText('请选择预计货好日期。')).toBeVisible();

    await page.getByLabel('选择常用发货人').selectOption(alternateShipper.id);
    await expect(page.getByLabel('发货人名称')).toHaveValue(`备用发货人 ${run}`);
    await page.getByLabel('发货人名称').fill(`备用发货人（已编辑）${run}`);
    await page.getByRole('button', { name: '更新所选发货人' }).click();
    await expect(page.getByLabel('选择常用发货人').locator('option:checked')).toContainText(
      '已编辑',
    );
    await page.getByRole('button', { name: '设为默认' }).click();
    await expect(page.getByLabel('选择常用发货人').locator('option:checked')).toContainText('默认');
    await page.getByRole('button', { name: '停用' }).click();
    await expect(page.getByLabel('选择常用发货人')).toHaveValue('');

    await page.getByLabel('发货人名称').fill(`新发货人 ${run}`);
    await page.getByLabel('发货人地址').fill('深圳市盐田区');
    await page.getByLabel('保存到常用发货人').check();
    await page.getByRole('button', { name: '保存草稿' }).click();
    await expect(page.getByLabel('选择常用发货人').locator('option:checked')).toContainText(
      `新发货人 ${run}`,
    );

    const activeShippers = await json<Array<{ id: string; isDefault: boolean }>>(
      await request.get(`${apiBase}/bookings/shippers`, { headers: bearer(customerToken) }),
      'list active shippers',
    );
    expect(activeShippers.some((shipper) => shipper.id === alternateShipper.id)).toBeFalsy();
    expect(activeShippers.some((shipper) => shipper.id === defaultShipper.id)).toBeTruthy();

    await page.getByLabel('货物品名').fill('Consumer goods');
    await page.getByLabel('包装类型').selectOption('CARTON');
    await page.getByLabel('包装数量').fill('100');
    await page.getByLabel('预计货好日期').fill(dateOnly(addDays(now, 3)));
    await page.getByLabel('毛重 KG').fill('12000');
    await page.getByRole('button', { name: '保存草稿' }).click();
    await page.getByRole('button', { name: '提交订舱' }).click();
    await page.getByRole('button', { name: '确认提交给操作团队' }).click();
    await expect(page.getByText('已提交')).toBeVisible();

    const adminContext = await browser.newContext();
    await browserLogin(adminContext.request, adminEmail, adminPassword!);
    const adminPage = await adminContext.newPage();
    await adminPage.goto(`/admin/bookings/${booking.id}`);
    await adminPage.getByRole('button', { name: '退回补充' }).click();
    await adminPage.getByLabel('退回原因').selectOption('CARGO_INCOMPLETE');
    await adminPage.getByLabel('补充说明 *').fill('请补充更具体的货物描述。');
    await adminPage.getByRole('button', { name: '确认退回' }).click();
    await expect(adminPage.getByText('待补充资料')).toBeVisible();

    await ok(
      request.patch(`${apiBase}/bookings/${booking.id}`, {
        headers: bearer(customerToken),
        data: { commodity: 'Consumer electronics accessories' },
      }),
      'revise booking',
    );
    await ok(
      request.post(`${apiBase}/bookings/${booking.id}/submit`, { headers: bearer(customerToken) }),
      'resubmit booking',
    );
    await adminPage.reload();
    await adminPage.getByRole('button', { name: '审核通过' }).click();
    await expect(adminPage.getByRole('dialog', { name: '确认审核通过' })).toBeVisible();
    await adminPage.getByRole('button', { name: '确认通过' }).click();
    await expect(adminPage.getByText('待订舱')).toBeVisible();
    await adminPage.getByRole('button', { name: '提交订舱' }).click();
    await adminPage.getByLabel('订舱对象').fill('E2E Carrier Agent');
    await adminPage.getByLabel('订舱参考号（选填）').fill(`REF-${run}`);
    await adminPage.getByRole('button', { name: '确认已提交' }).click();
    await expect(adminPage.getByText('已提交订舱 · 待 SO')).toBeVisible();
    await expect(adminPage.getByText(`REF-${run}`, { exact: false })).toBeVisible();
    await expect(adminPage.getByLabel('SO 文件')).toHaveCount(0);
    await adminPage.getByRole('button', { name: '登记 SO' }).click();
    await adminPage.getByLabel('SO 文件').setInputFiles({
      name: `SO-${run}.pdf`,
      mimeType: 'application/pdf',
      buffer: Buffer.from('%PDF-1.4\n%%EOF'),
    });
    await adminPage.getByLabel('SO 号').fill(`SO-${run}`);
    await adminPage.getByLabel('来源名称').fill('E2E Carrier Agent');
    await adminPage.getByLabel('Vessel').fill('E2E STAR');
    await adminPage.getByLabel('Voyage').fill(`V${run.slice(-5)}`);
    await adminPage.getByRole('button', { name: '保存 SO' }).click();
    await expect(adminPage.getByText('已订舱')).toBeVisible();
    await expect(adminPage.getByText('SO 已登记 · 客户暂不可见')).toBeVisible();
    const hiddenSoRecords = await json<unknown[]>(
      await request.get(`${apiBase}/bookings/${booking.id}/so-records`, {
        headers: bearer(customerToken),
      }),
      'verify internal SO is hidden',
    );
    expect(hiddenSoRecords).toHaveLength(0);
    await adminPage.getByRole('button', { name: '发布给客户' }).click();
    await expect(adminPage.getByRole('dialog', { name: '确认发布 SO' })).toBeVisible();
    await adminPage.getByRole('button', { name: '确认发布' }).click();
    await expect(adminPage.getByText('已订舱')).toBeVisible();
    const publishedSoRecords = await json<Array<{ soNumber: string }>>(
      await request.get(`${apiBase}/bookings/${booking.id}/so-records`, {
        headers: bearer(customerToken),
      }),
      'list published SO',
    );
    expect(publishedSoRecords).toMatchObject([{ soNumber: `SO-${run}` }]);
    await adminContext.close();
  });
});

async function login(request: APIRequestContext, email: string, password: string) {
  const result = await json<{ accessToken: string }>(
    await request.post(`${apiBase}/auth/login`, { data: { tenantCode, email, password } }),
    `login ${email}`,
  );
  return result.accessToken;
}

async function browserLogin(request: APIRequestContext, email: string, password: string) {
  await json(
    await request.post(`${webBase}/api/v1/auth/login`, {
      data: { tenantCode, email, password },
    }),
    `browser login ${email}`,
  );
}

async function ok(responsePromise: Promise<APIResponse>, operation: string) {
  await json(await responsePromise, operation);
}

async function json<T>(response: APIResponse, operation: string): Promise<T> {
  const body = (await response.json()) as T & { code?: string; message?: string };
  if (!response.ok())
    throw new Error(
      `${operation} failed (${response.status()}): ${body.code ?? ''} ${body.message ?? ''}`,
    );
  return body;
}

const bearer = (token: string) => ({ authorization: `Bearer ${token}` });
const addDays = (date: Date, days: number) => new Date(date.getTime() + days * 86_400_000);
const dateOnly = (date: Date) => date.toISOString().slice(0, 10);
