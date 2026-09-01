import { expect, test, type APIRequestContext, type APIResponse } from '@playwright/test';

const apiPort = process.env.E2E_API_PORT ?? '4000';
const apiBase = process.env.E2E_API_URL ?? `http://127.0.0.1:${apiPort}/api/v1`;
const webBase = process.env.E2E_BASE_URL ?? 'http://127.0.0.1:3000';
const tenantCode = process.env.E2E_TENANT_CODE ?? 'DEMO';
const adminEmail = process.env.E2E_ADMIN_EMAIL ?? 'admin@demo.freight.local';
const customerEmail = process.env.E2E_CUSTOMER_EMAIL ?? 'customer@demo.freight.local';
const adminPassword = process.env.E2E_ADMIN_PASSWORD;
const customerPassword = process.env.E2E_CUSTOMER_PASSWORD;

test.describe('Rate to Invoice golden path', () => {
  test.skip(
    !adminPassword || !customerPassword,
    'Set E2E_ADMIN_PASSWORD and E2E_CUSTOMER_PASSWORD',
  );

  test('completes the persisted and authorized customer lifecycle', async ({
    browser,
    request,
  }) => {
    test.setTimeout(120_000);
    const adminToken = await apiLogin(request, adminEmail, adminPassword!);
    const customerToken = await apiLogin(request, customerEmail, customerPassword!);
    const run = Date.now().toString(36).toUpperCase();
    const now = new Date();
    const effectiveDate = dateOnly(now);
    const etdDate = addDays(now, 7);
    const expiryDate = dateOnly(addDays(now, 30));

    const rate = await apiJson<{ id: string }>(
      await request.post(`${apiBase}/rates`, {
        headers: bearer(adminToken),
        data: {
          rateNo: `E2E-${run}`,
          polCode: 'CNSHA',
          polName: 'Shanghai',
          podCode: 'USLGB',
          podName: 'Long Beach',
          carrierCode: 'E2E',
          serviceName: 'Golden Path',
          effectiveDate,
          expiryDate,
          etd: etdDate.toISOString(),
          transitDays: 18,
          supplierName: 'Golden Carrier',
          currency: 'USD',
          status: 'ACTIVE',
          prices: [
            {
              containerType: '40HQ',
              costAmount: '1000.00',
              sellAmount: '1250.00',
              currency: 'USD',
            },
          ],
          charges: [
            {
              chargeCode: 'DOC',
              chargeName: 'Documentation',
              chargeBasis: 'PER_BL',
              amount: '75.00',
              currency: 'USD',
              isIncluded: false,
            },
          ],
        },
      }),
      'create rate',
    );

    const search = await apiJson<{ items: Array<{ id: string; sellAmount: string }> }>(
      await request.get(`${apiBase}/portal/rates`, {
        headers: bearer(customerToken),
        params: {
          page: 1,
          pageSize: 20,
          polCode: 'CNSHA',
          podCode: 'USLGB',
          containerType: '40HQ',
          etdFrom: dateOnly(addDays(now, 1)),
          etdTo: dateOnly(addDays(now, 14)),
          carrierCode: 'E2E',
        },
      }),
      'search customer rate',
    );
    expect(search.items.some((item) => item.id === rate.id)).toBeTruthy();

    const quote = await apiJson<{ id: string; quoteNo: string }>(
      await request.post(`${apiBase}/quotes`, {
        headers: bearer(customerToken),
        data: { rateId: rate.id, containerType: '40HQ', quantity: 2 },
      }),
      'create quote',
    );
    await apiOk(
      request.post(`${apiBase}/admin/quotes/${quote.id}/send`, { headers: bearer(adminToken) }),
      'send quote',
    );
    await apiOk(
      request.get(`${apiBase}/quotes/${quote.id}`, { headers: bearer(customerToken) }),
      'view quote',
    );
    await apiOk(
      request.post(`${apiBase}/quotes/${quote.id}/accept`, { headers: bearer(customerToken) }),
      'accept quote',
    );

    const booking = await apiJson<{ id: string; bookingNo: string }>(
      await request.post(`${apiBase}/bookings`, {
        headers: bearer(customerToken),
        data: { quoteId: quote.id },
      }),
      'create booking',
    );
    await apiOk(
      request.patch(`${apiBase}/bookings/${booking.id}`, {
        headers: bearer(customerToken),
        data: {
          commodity: 'Consumer goods',
          packageType: 'CARTON',
          packages: 120,
          grossWeight: '18500.00',
          volumeCbm: '62.50',
          cargoReadyDate: dateOnly(addDays(now, 3)),
          isDangerousGoods: false,
          shipperName: 'Golden Path Shipper',
          shipperAddress: 'Shanghai, China',
          bookingContactName: 'Golden Customer',
          bookingContactEmail: customerEmail,
          bookingContactPhone: '+86-21-55550000',
        },
      }),
      'complete booking',
    );
    await apiOk(
      request.post(`${apiBase}/bookings/${booking.id}/submit`, { headers: bearer(customerToken) }),
      'submit booking',
    );
    await apiOk(
      request.post(`${apiBase}/admin/bookings/${booking.id}/approve`, {
        headers: bearer(adminToken),
        data: { remark: 'Golden path approval' },
      }),
      'approve booking',
    );
    await apiOk(
      request.post(`${apiBase}/admin/bookings/${booking.id}/submit-to-carrier`, {
        headers: bearer(adminToken),
        data: { sourceName: 'Golden Carrier', reference: `GP-${run}` },
      }),
      'submit booking to carrier',
    );
    const soRecord = await apiJson<{ id: string }>(
      await request.post(`${apiBase}/admin/bookings/${booking.id}/so-records`, {
        headers: bearer(adminToken),
        multipart: {
          soNumber: `SO-${run}`,
          sourceType: 'CARRIER',
          sourceName: 'Golden Carrier',
          receivedAt: new Date().toISOString(),
          file: { name: `SO-${run}.pdf`, mimeType: 'application/pdf', buffer: pdfFixture('SO') },
        },
      }),
      'save SO internally',
    );
    const hiddenSo = await apiJson<unknown[]>(
      await request.get(`${apiBase}/bookings/${booking.id}/so-records`, {
        headers: bearer(customerToken),
      }),
      'verify draft SO is hidden',
    );
    expect(hiddenSo).toHaveLength(0);
    await apiOk(
      request.post(`${apiBase}/admin/bookings/${booking.id}/so-records/${soRecord.id}/publish`, {
        headers: bearer(adminToken),
      }),
      'publish SO',
    );

    const shipment = await apiJson<{ id: string; shipmentNo: string }>(
      await request.post(`${apiBase}/admin/bookings/${booking.id}/shipments`, {
        headers: bearer(adminToken),
        data: {
          vessel: 'GOLDEN STAR',
          voyage: `GP${run.slice(-5)}`,
          eta: addDays(now, 25).toISOString(),
        },
      }),
      'create shipment',
    );
    for (const [containerNo, sealNo] of [
      [`EAEA${numericSuffix(run, 1)}`, 'SEAL-1'],
      [`EAEB${numericSuffix(run, 2)}`, 'SEAL-2'],
    ]) {
      await apiOk(
        request.post(`${apiBase}/shipments/${shipment.id}/containers`, {
          headers: bearer(adminToken),
          data: { containerNo, containerType: '40HQ', sealNo, vgmWeight: '19000.00' },
        }),
        'add container',
      );
    }
    await apiOk(
      request.post(`${apiBase}/shipments/${shipment.id}/start`, {
        headers: bearer(adminToken),
        data: { remark: 'Operations started' },
      }),
      'start shipment',
    );
    await apiOk(
      request.post(`${apiBase}/shipments/${shipment.id}/depart`, {
        headers: bearer(adminToken),
        data: { remark: 'Vessel departed on schedule' },
      }),
      'depart shipment',
    );
    await apiOk(
      request.post(`${apiBase}/shipments/${shipment.id}/events`, {
        headers: bearer(adminToken),
        data: {
          eventType: 'VESSEL_DEPARTED',
          eventTime: new Date().toISOString(),
          locationCode: 'CNSHA',
          locationName: 'Shanghai',
          remark: 'Customer-visible departure milestone',
          customerVisible: true,
        },
      }),
      'add tracking event',
    );
    await apiOk(
      request.post(`${apiBase}/shipments/${shipment.id}/documents`, {
        headers: bearer(adminToken),
        multipart: {
          documentType: 'FINAL_BL',
          customerVisible: 'true',
          file: { name: `BL-${run}.pdf`, mimeType: 'application/pdf', buffer: pdfFixture('BL') },
        },
      }),
      'upload BL',
    );

    const invoice = await apiJson<{ id: string; invoiceNo: string }>(
      await request.post(`${apiBase}/admin/invoices`, {
        headers: bearer(adminToken),
        data: {
          shipmentId: shipment.id,
          currency: 'USD',
          taxAmount: '25.00',
          dueDate: dateOnly(addDays(now, 30)),
          lines: [
            {
              chargeCode: 'OCEAN_FREIGHT',
              description: 'Ocean freight',
              quantity: '2',
              unitPrice: '650.00',
            },
            { chargeCode: 'DOC', description: 'Documentation', quantity: '1', unitPrice: '75.00' },
          ],
        },
      }),
      'create invoice',
    );
    await apiOk(
      request.post(`${apiBase}/admin/invoices/${invoice.id}/documents`, {
        headers: bearer(adminToken),
        multipart: {
          file: {
            name: `INVOICE-${run}.pdf`,
            mimeType: 'application/pdf',
            buffer: pdfFixture('INVOICE'),
          },
        },
      }),
      'upload invoice attachment',
    );
    await apiOk(
      request.post(`${apiBase}/admin/invoices/${invoice.id}/issue`, {
        headers: bearer(adminToken),
      }),
      'issue invoice',
    );
    await apiOk(
      request.post(`${apiBase}/invoices/${invoice.id}/confirm`, { headers: bearer(customerToken) }),
      'confirm invoice',
    );

    const customerContext = await browser.newContext();
    await browserLogin(customerContext.request, customerEmail, customerPassword!);
    const customerPage = await customerContext.newPage();
    await customerPage.goto(`/portal/shipments/${shipment.id}`);
    await expect(customerPage.getByRole('heading', { name: shipment.shipmentNo })).toBeVisible();
    await expect(customerPage.getByText('EAEA', { exact: false })).toBeVisible();
    await expect(customerPage.getByText('EAEB', { exact: false })).toBeVisible();
    await expect(customerPage.getByText('Customer-visible departure milestone')).toBeVisible();
    await expect(customerPage.getByText(`BL-${run}.pdf`)).toBeVisible();

    await customerPage.goto(`/portal/billing/${invoice.id}`);
    await expect(customerPage.getByRole('heading', { name: invoice.invoiceNo })).toBeVisible();
    await expect(customerPage.getByText('CUSTOMER_CONFIRMED')).toBeVisible();
    await expect(customerPage.getByText(`INVOICE-${run}.pdf`)).toBeVisible();
    await customerContext.close();
  });
});

async function apiLogin(request: APIRequestContext, email: string, password: string) {
  const result = await apiJson<{ accessToken: string }>(
    await request.post(`${apiBase}/auth/login`, { data: { tenantCode, email, password } }),
    `login ${email}`,
  );
  return result.accessToken;
}

async function apiOk(responsePromise: Promise<APIResponse>, operation: string) {
  await apiJson<unknown>(await responsePromise, operation);
}

async function apiJson<T>(response: APIResponse, operation: string): Promise<T> {
  const body = (await response.json()) as T & { code?: string; message?: string };
  if (!response.ok())
    throw new Error(
      `${operation} failed (${response.status()}): ${body.code ?? ''} ${body.message ?? ''}`,
    );
  return body;
}

async function browserLogin(request: APIRequestContext, email: string, password: string) {
  await apiJson(
    await request.post(`${webBase}/api/v1/auth/login`, {
      data: { tenantCode, email, password },
    }),
    `browser login ${email}`,
  );
}

const bearer = (token: string) => ({ authorization: `Bearer ${token}` });
const addDays = (date: Date, days: number) => new Date(date.getTime() + days * 86_400_000);
const dateOnly = (date: Date) => date.toISOString().slice(0, 10);
const numericSuffix = (run: string, offset: number) =>
  String((Number.parseInt(run.slice(-6), 36) + offset) % 10_000_000).padStart(7, '0');
const pdfFixture = (label: string) =>
  Buffer.from(`%PDF-1.4\n1 0 obj<</Type/Catalog>>endobj\n% ${label} golden path\n%%EOF`);
