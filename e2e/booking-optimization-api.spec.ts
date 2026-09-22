import { expect, test, type APIResponse } from '@playwright/test';

const api =
  process.env.E2E_API_URL ?? `http://127.0.0.1:${process.env.E2E_API_PORT ?? '4000'}/api/v1`;
const tenantCode = process.env.E2E_TENANT_CODE ?? 'DEMO';

test('persists委托版本 and confirmation handoff through authenticated HTTP and real object storage', async ({
  request,
}) => {
  const adminPassword = process.env.E2E_ADMIN_PASSWORD;
  const customerPassword = process.env.E2E_CUSTOMER_PASSWORD;
  expect(adminPassword, 'E2E_ADMIN_PASSWORD is required').toBeTruthy();
  expect(customerPassword, 'E2E_CUSTOMER_PASSWORD is required').toBeTruthy();
  const adminEmail = process.env.E2E_ADMIN_EMAIL ?? 'admin@demo.freight.local';
  const customerEmail = process.env.E2E_CUSTOMER_EMAIL ?? 'customer@demo.freight.local';
  const login = async (email: string, password: string) => {
    const result = await json<{ accessToken: string }>(
      request.post(`${api}/auth/login`, { data: { tenantCode, email, password } }),
    );
    return { authorization: `Bearer ${result.accessToken}` };
  };
  const admin = await login(adminEmail, adminPassword!);
  const customer = await login(customerEmail, customerPassword!);
  const run = Date.now().toString(36).toUpperCase();
  const future = (days: number) => new Date(Date.now() + days * 86_400_000).toISOString();
  const rate = await json<{ id: string }>(
    request.post(`${api}/rates`, {
      headers: admin,
      data: {
        rateNo: `BOOKOPT-${run}`,
        polCode: 'CNSHA',
        polName: 'Shanghai',
        podCode: 'USLGB',
        podName: 'Long Beach',
        carrierCode: 'TEST',
        effectiveDate: future(-1).slice(0, 10),
        expiryDate: future(30).slice(0, 10),
        etd: future(7),
        currency: 'USD',
        status: 'ACTIVE',
        prices: [
          { containerType: '40HQ', costAmount: '1000', sellAmount: '1300', currency: 'USD' },
        ],
      },
    }),
  );
  const quote = await json<{ id: string }>(
    request.post(`${api}/quotes`, {
      headers: customer,
      data: {
        rateId: rate.id,
        containerType: '40HQ',
        containerQuantity: 1,
        cargoItems: [{ commodity: '委托版本测试货物', estimatedGrossWeight: 1000 }],
        requestedServices: [],
        pickupLocationText: '上海测试提货地',
        deliveryLocationText: '长滩测试送货地',
      },
    }),
  );
  await json(request.post(`${api}/admin/quotes/${quote.id}/send`, { headers: admin }));
  await json(request.get(`${api}/quotes/${quote.id}`, { headers: customer }));
  await json(request.post(`${api}/quotes/${quote.id}/accept`, { headers: customer }));
  const booking = await json<{ id: string }>(
    request.post(`${api}/bookings`, { headers: customer, data: { quoteId: quote.id } }),
  );
  const customerBooking = `${api}/bookings/${booking.id}`;
  const internalBooking = `${api}/admin/bookings/${booking.id}`;
  await json(
    request.patch(customerBooking, {
      headers: customer,
      data: {
        packageType: 'CARTON',
        packages: 10,
        grossWeight: '1000',
        volumeCbm: '12',
        cargoReadyDate: future(2).slice(0, 10),
        shipperName: '测试发货人第一版',
        shipperAddress: '上海测试地址',
        bookingContactName: '测试联系人',
        bookingContactEmail: customerEmail,
      },
    }),
  );
  await json(request.post(`${customerBooking}/submit`, { headers: customer }));
  await json(
    request.post(`${internalBooking}/request-revision`, {
      headers: admin,
      data: {
        reasonCode: 'SHIPPER_INCOMPLETE',
        customerVisibleRemark: '请核对发货人',
        internalRemark: 'SECRET-INTERNAL-NOTE',
      },
    }),
  );
  await json(
    request.patch(customerBooking, {
      headers: customer,
      data: { shipperName: '测试发货人第二版' },
    }),
  );
  await json(request.post(`${customerBooking}/submit`, { headers: customer }));
  const submissions = await json<Array<{ version: number; snapshot: { shipperName: string } }>>(
    request.get(`${customerBooking}/submissions`, { headers: customer }),
  );
  expect(submissions.map((row) => row.version)).toEqual([2, 1]);
  expect(submissions[1]?.snapshot.shipperName).toBe('测试发货人第一版');
  expect(submissions[0]?.snapshot.shipperName).toBe('测试发货人第二版');
  expect(JSON.stringify(submissions)).not.toMatch(/SECRET-INTERNAL-NOTE|costAmount|internalRemark/);
  expect((await request.get(`${customerBooking}/submissions`)).status()).toBe(401);
  expect((await request.post(`${internalBooking}/approve`, { headers: customer })).status()).toBe(
    403,
  );
  await json(request.post(`${internalBooking}/approve`, { headers: admin, data: {} }));
  await json(
    request.post(`${internalBooking}/submit-to-carrier`, {
      headers: admin,
      data: { sourceName: '测试承运方', reference: run },
    }),
  );
  const bytes = Buffer.from('%PDF-1.4\n% Booking optimization integration fixture\n%%EOF');
  const fields = {
    soNumber: `SO-${run}`,
    sourceType: 'CARRIER',
    sourceName: 'INTERNAL-CARRIER-NAME',
    carrierCode: 'CONFIRM',
    vessel: 'CONFIRMED VESSEL',
    voyage: 'C001',
    etd: future(8),
    eta: future(24),
    receivedAt: '2026-09-22T09:15:00+08:00',
    cyCutoffAt: '2026-09-26T16:30:00+08:00',
    siCutoffAt: '2026-09-25T10:15:00+08:00',
    vgmCutoffAt: '2026-09-26T09:45:00+08:00',
    terminal: '测试码头',
    file: { name: `confirmation-${run}.pdf`, mimeType: 'application/pdf', buffer: bytes },
  };
  const invalid = await request.post(`${internalBooking}/so-records`, {
    headers: admin,
    multipart: { ...fields, receivedAt: '2026-02-30T09:00:00+08:00' },
  });
  expect(invalid.status()).toBe(400);
  const confirmation = await json<{
    id: string;
    receivedAt: string;
    cyCutoffAt: string;
    document: { id: string };
  }>(request.post(`${internalBooking}/so-records`, { headers: admin, multipart: fields }));
  expect(confirmation.receivedAt).toBe('2026-09-22T01:15:00.000Z');
  expect(confirmation.cyCutoffAt).toBe('2026-09-26T08:30:00.000Z');
  expect(await json(request.get(`${customerBooking}/so-records`, { headers: customer }))).toEqual(
    [],
  );
  expect(
    (
      await request.get(`${api}/documents/${confirmation.document.id}/download`, {
        headers: customer,
      })
    ).status(),
  ).toBe(404);
  const shipment = await json<{
    id: string;
    vessel: string;
    etd: string;
    eta: string;
    carrierCode: string;
  }>(
    request.post(`${internalBooking}/shipments`, {
      headers: admin,
      data: { soRecordId: confirmation.id, vessel: 'UNTRUSTED', eta: future(60) },
    }),
  );
  expect(shipment).toMatchObject({
    vessel: fields.vessel,
    carrierCode: fields.carrierCode,
    etd: fields.etd,
    eta: fields.eta,
  });
  expect(
    (await request.post(`${internalBooking}/shipments`, { headers: admin, data: {} })).status(),
  ).toBe(400);
  await json(
    request.post(`${internalBooking}/so-records/${confirmation.id}/publish`, { headers: admin }),
  );
  const published = await json<Array<Record<string, unknown>>>(
    request.get(`${customerBooking}/so-records`, { headers: customer }),
  );
  expect(published).toHaveLength(1);
  expect(published[0]).not.toHaveProperty('sourceName');
  expect(published[0]).not.toHaveProperty('uploadedBy');
  const download = await request.get(`${api}/documents/${confirmation.document.id}/download`, {
    headers: customer,
  });
  expect(download.ok()).toBe(true);
  expect(await download.body()).toEqual(bytes);
  const revision = await json<{ id: string }>(
    request.post(`${internalBooking}/so-records/${confirmation.id}/replace`, {
      headers: admin,
      multipart: {
        ...fields,
        soNumber: `SO-${run}-V2`,
        vessel: 'REVISED VESSEL',
        file: { ...fields.file, name: `revision-${run}.pdf` },
      },
    }),
  );
  expect(await json(request.get(`${customerBooking}/so-records`, { headers: customer }))).toEqual(
    published,
  );
  const differenceUrl = `${api}/shipments/${shipment.id}/confirmation-difference`;
  expect((await request.get(differenceUrl, { headers: customer })).status()).toBe(403);
  const difference = await json<{
    shipment: { updatedAt: string };
    differences: Array<{ field: string; proposed: string }>;
  }>(request.get(differenceUrl, { headers: admin }));
  expect(difference.differences).toContainEqual({
    field: 'vessel',
    current: 'CONFIRMED VESSEL',
    proposed: 'REVISED VESSEL',
  });
  const sync = {
    soRecordId: revision.id,
    expectedUpdatedAt: difference.shipment.updatedAt,
    fields: ['vessel'],
  };
  expect(
    (
      await request.post(`${api}/shipments/${shipment.id}/sync-confirmation`, {
        headers: admin,
        data: { ...sync, fields: ['atd'] },
      })
    ).status(),
  ).toBe(400);
  await json(
    request.post(`${api}/shipments/${shipment.id}/sync-confirmation`, {
      headers: admin,
      data: sync,
    }),
  );
  expect(
    (
      await request.post(`${api}/shipments/${shipment.id}/sync-confirmation`, {
        headers: admin,
        data: sync,
      })
    ).status(),
  ).toBe(409);
  await json(
    request.post(`${internalBooking}/so-records/${revision.id}/publish`, { headers: admin }),
  );
  const final = await json<{ vessel: string; atd: null; ata: null }>(
    request.get(`${api}/shipments/${shipment.id}`, { headers: customer }),
  );
  expect(final).toMatchObject({ vessel: 'REVISED VESSEL', atd: null, ata: null });
});

async function json<T = unknown>(pending: Promise<APIResponse>): Promise<T> {
  const response = await pending;
  const payload = (await response.json()) as T & { code?: string; message?: string };
  expect(response.ok(), `${response.status()} ${payload.code ?? ''} ${payload.message ?? ''}`).toBe(
    true,
  );
  return payload;
}
