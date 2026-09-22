import assert from 'node:assert/strict';
import test from 'node:test';
import {
  confirmationTimeToIso,
  formatConfirmationTime,
  cutoffHint,
} from './booking-confirmation-time.ts';

void test('explicit business offset round trips without machine timezone', () => {
  assert.equal(confirmationTimeToIso('2026-09-22T16:30'), '2026-09-22T08:30:00.000Z');
  assert.equal(confirmationTimeToIso('2026-09-22T16:30', '-07:00'), '2026-09-22T23:30:00.000Z');
  assert.match(formatConfirmationTime('2026-09-22T08:30:00Z'), /16:30/);
  assert.throws(() => confirmationTimeToIso('2026-02-30T12:00'));
  assert.throws(() => confirmationTimeToIso('2026-09-22'));
  assert.match(
    cutoffHint('2026-09-22T08:30:00Z', Date.parse('2026-09-23T08:30:00Z')),
    /不代表业务逾期/,
  );
});
