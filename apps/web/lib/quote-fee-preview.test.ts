import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { previewFee } from './quote-fee-preview.ts';

void test('draft fee preview is exact and does not turn missing cost into zero', () => {
  assert.deepEqual(previewFee({ quantity: '3', unitPrice: '0.1', costAmount: '0.02' }), { sell: '0.3000', cost: '0.0600', profit: '0.2400' });
  assert.deepEqual(previewFee({ quantity: '1', unitPrice: '100', costAmount: null }), { sell: '100.0000', cost: null, profit: null });
  assert.deepEqual(previewFee({ quantity: '', unitPrice: '100', costAmount: '0' }), { sell: null, cost: null, profit: null });
});
