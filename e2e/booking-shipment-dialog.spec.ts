import { expect, test } from '@playwright/test';

for (const succeeds of [true, false]) {
  test(`shipment confirmation ${succeeds ? 'closes after success' : 'stays open after failure'}`, async ({
    page,
  }) => {
    let created = false;
    let submissions = 0;
    const shipment = {
      id: 'shipment-dialog-test',
      shipmentNo: 'SHP-DIALOG-TEST',
      status: 'PLANNED',
    };
    await page.route('**/api/v1/**', async (route) => {
      const path = new URL(route.request().url()).pathname;
      if (path === '/api/v1/auth/refresh') {
        return route.fulfill({
          json: {
            accessToken: 'test-session',
            accessTokenExpiresIn: 900,
            user: {
              id: 'operator',
              tenantId: 'test-tenant',
              tenantCode: 'TEST',
              tenantName: 'Test Forwarder',
              email: 'operator@example.com',
              displayName: 'Test Operator',
              userType: 'INTERNAL',
              roles: ['OPERATION'],
              permissions: ['booking.read', 'shipment.create'],
            },
          },
        });
      }
      if (path.endsWith('/shipments') && route.request().method() === 'POST') {
        submissions += 1;
        created = succeeds;
        return route.fulfill({
          status: succeeds ? 201 : 400,
          json: succeeds ? shipment : { message: '测试创建失败' },
        });
      }
      if (path.endsWith('/so-records')) {
        return route.fulfill({
          json: [
            {
              id: 'so-test',
              soNumber: 'SO-TEST',
              status: 'INTERNAL_DRAFT',
              sourceType: 'CARRIER',
              carrierCode: 'CNC',
              vessel: null,
              voyage: null,
              etd: '2026-09-07T00:00:00Z',
              eta: null,
              createdAt: '2026-09-07T00:00:00Z',
              receivedAt: '2026-09-07T00:00:00Z',
              version: 1,
              document: { id: 'document-test', originalFilename: 'so.pdf', customerVisible: false },
            },
          ],
        });
      }
      if (path === '/api/v1/admin/bookings/booking-dialog-test') {
        return route.fulfill({
          json: {
            id: 'booking-dialog-test',
            bookingNo: 'BOOK-DIALOG-TEST',
            status: 'BOOKED',
            polCode: 'CNXMN',
            podCode: 'IDJKT',
            carrierCode: 'CNC',
            createdAt: '2026-09-07T00:00:00Z',
            customer: { name: 'Test Customer' },
            quote: null,
            reviewActions: [],
            reviewIssues: [],
            cargoItems: [],
            containerRequests: [],
            shipments: created ? [shipment] : [],
          },
        });
      }
      return route.fulfill({ json: [] });
    });

    await page.goto('/admin/bookings/booking-dialog-test');
    await page.getByRole('button', { name: '创建 Basic Shipment', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: '确认创建 Basic Shipment' });
    await dialog.getByRole('button', { name: '确认创建', exact: true }).click();
    if (succeeds) {
      // Wait for refreshed details before checking: loading temporarily unmounts the dialog too.
      await expect(page.getByRole('link', { name: /SHP-DIALOG-TEST/ })).toBeVisible();
      await expect(page.getByText('Basic Shipment 已创建', { exact: true })).toBeVisible();
      await expect(dialog).toHaveCount(0);
      await expect(
        page.getByRole('button', { name: '创建 Basic Shipment', exact: true }),
      ).toHaveCount(0);
    } else {
      await expect(page.getByText('测试创建失败').first()).toBeVisible();
      await expect(dialog).toBeVisible();
      await expect(dialog.getByRole('button', { name: '确认创建', exact: true })).toBeEnabled();
    }
    expect(submissions).toBe(1);
  });
}
