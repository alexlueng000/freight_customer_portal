import { expect, test } from '@playwright/test';
import { generateQuoteCustomerTerms } from '../apps/web/lib/quote-customer-terms';

test('quote terms use only explicit fee names, units and validity', () => {
  const fees = [
    { chargeName: '海运费', chargeBasis: 'PER_CONTAINER' as const, containerType: '40GP', costAmount: '1850', internalNote: '采购信息' },
    { chargeName: '文件费', chargeBasis: 'PER_BL' as const, containerType: null },
  ];
  const text = generateQuoteCustomerTerms(fees, '2026-09-25');
  expect(text).toContain('海运费（按箱 / 40GP）、文件费（按提单）');
  expect(text).toContain('报价有效期至：2026-09-25');
  expect(text).not.toMatch(/1850|采购信息|不含|保证|舱位/);
});

test('incomplete rows do not generate misleading terms', () => {
  expect(generateQuoteCustomerTerms([], '2026-09-25')).toBeNull();
  expect(generateQuoteCustomerTerms([{ chargeName: ' ', chargeBasis: 'PER_BL', containerType: null }], '2026-09-25')).toBeNull();
});

test('large quotes reference the full fee table without truncation', () => {
  const text = generateQuoteCustomerTerms(Array.from({ length: 100 }, () => ({ chargeName: '费用名称'.repeat(30), chargeBasis: 'PER_SHIPMENT' as const, containerType: null })), '2026-09-25');
  expect(text).toContain('共 100 项费用');
  expect(text!.length).toBeLessThanOrEqual(2000);
  expect(text).toContain('2026-09-25');
});
