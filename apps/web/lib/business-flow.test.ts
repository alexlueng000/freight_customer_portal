import assert from 'node:assert/strict';
import test from 'node:test';
import {
  resolveBookingBusinessFlow,
  resolveInvoiceBusinessFlow,
  resolveQuoteBusinessFlow,
  resolveShipmentBusinessFlow,
} from './business-flow.ts';

void test('stops rejected, cancelled and expired records without completing their stage', () => {
  for (const status of ['REJECTED', 'EXPIRED', 'CANCELLED']) {
    const result = resolveQuoteBusinessFlow({ status, bookings: [] }, status);
    assert.equal(result.stopped, true);
    assert.equal(result.currentStageComplete, false);
  }
  assert.equal(resolveBookingBusinessFlow({ status: 'CANCELLED', shipments: [] }).stopped, true);
  assert.equal(resolveShipmentBusinessFlow({ status: 'CANCELLED' }).stopped, true);
});

void test('uses the linked shipment as the farthest progress on quote and booking pages', () => {
  const booking = { status: 'BOOKED', shipments: [{ status: 'DEPARTED' }] };
  assert.deepEqual(resolveBookingBusinessFlow(booking), {
    currentStage: 'shipment',
    currentStageComplete: false,
    currentStatus: '已开船',
  });
  assert.deepEqual(resolveQuoteBusinessFlow({ status: 'BOOKED', bookings: [booking] }, '已转订舱'), {
    currentStage: 'shipment',
    currentStageComplete: false,
    currentStatus: '已开船',
  });
});

void test('keeps invoice active until payment is recorded', () => {
  assert.deepEqual(resolveInvoiceBusinessFlow({ status: 'ISSUED' }), {
    currentStage: 'invoice',
    currentStageComplete: false,
    currentStatus: '已发布',
  });
  assert.deepEqual(resolveInvoiceBusinessFlow({ status: 'PAID' }), {
    currentStage: 'invoice',
    currentStageComplete: true,
    currentStatus: '已收款',
  });
});

void test('keeps all transport milestones in one customer stage', () => {
  assert.deepEqual(resolveShipmentBusinessFlow({ status: 'PLANNED' }, 'portal'), {
    currentStage: 'shipment',
    currentStageComplete: false,
    currentStatus: '待开船',
  });
  assert.deepEqual(resolveShipmentBusinessFlow({ status: 'ARRIVED' }, 'portal'), {
    currentStage: 'shipment',
    currentStageComplete: true,
    currentStatus: '已到港',
  });
});

void test('shows booking as complete when SO is registered but shipment is not created', () => {
  assert.deepEqual(
    resolveQuoteBusinessFlow(
      { status: 'BOOKED', bookings: [{ status: 'BOOKED', shipments: [] }] },
      '已转订舱',
    ),
    {
      currentStage: 'booking',
      currentStageComplete: true,
      currentStatus: '已订舱',
    },
  );
});

void test('keeps an accepted quote at the completed formal quote stage before booking exists', () => {
  assert.deepEqual(resolveQuoteBusinessFlow({ status: 'ACCEPTED', bookings: [] }, '已接受'), {
    currentStage: 'formalQuote',
    currentStageComplete: true,
    currentStatus: '已接受',
  });
});
