import { customerSailingPattern } from './rate-sailing.js';

describe('customer-safe sailing information', () => {
  it.each(['每周五', '每月15日', 'FRI'])('extracts only the recognized %s value', (value) => {
    expect(customerSailingPattern(`采购成本 500 | Schedule: ${value} | 供应商秘密`)).toBe(value);
  });
  it.each([null, '普通内部备注', 'Schedule: 客户不得知的内部约定', 'Schedule: 每周五 采购价500'])('does not expose arbitrary remark content', (remark) => {
    expect(customerSailingPattern(remark)).toBeNull();
  });
});
