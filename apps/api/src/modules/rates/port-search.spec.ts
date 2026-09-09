import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { SearchCustomerRatesDto } from './dto/search-customer-rates.dto.js';
import { portDisplayName, portSearchFilter } from './port-search.js';

describe('port search and Chinese display', () => {
  it.each([['深圳', 'CNSZX'], ['厦门', 'CNXMN'], ['洛杉矶', 'USLAX'],
    [' los angeles ', 'USLAX'], ['LA', 'USLAX'], ['lax', 'USLAX'], ['cnxmn', 'CNXMN']])(
    'resolves %s to %s', (keyword, code) => {
      expect(portSearchFilter('pol', keyword).OR).toContainEqual({ polCode: { in: [code] } });
    },
  );
  it('keeps unknown names searchable and blank inputs unfiltered', () => {
    expect(portSearchFilter('pod', '某新港').OR).toContainEqual({ podName: { contains: '某新港', mode: 'insensitive' } });
    expect(portSearchFilter('pod', '  ')).toEqual({});
    expect(portDisplayName('XXXXX', '某新港')).toBe('某新港');
    expect(portDisplayName('XXXXX', '')).toBe('XXXXX');
    expect(portDisplayName('USLAX', 'Los Angeles')).toBe('洛杉矶');
  });
  it('does not translate a distinct or unknown port from its city name', () => {
    expect(portDisplayName('UNKNOWN', 'Shenzhen Terminal')).toBe('Shenzhen Terminal');
    expect(portSearchFilter('pol', '盐田').OR).not.toContainEqual({ polCode: { in: ['CNSZX'] } });
  });
  it('treats SQL wildcards literally', () => {
    expect(portSearchFilter('pod', '%_').OR).toContainEqual({ podName: { contains: '\\%\\_', mode: 'insensitive' } });
  });
  it('does not expand LA into unrelated names containing those letters', () => {
    expect(portSearchFilter('pod', 'LA').OR).not.toContainEqual({ podName: { contains: 'LA', mode: 'insensitive' } });
    expect(portSearchFilter('pod', 'LA').OR).toContainEqual({ podName: { contains: 'Los Angeles', mode: 'insensitive' } });
  });
  it('accepts Chinese keywords while preserving legacy code validation and length limits', async () => {
    expect(await validate(plainToInstance(SearchCustomerRatesDto, { pol: '深圳', pod: '洛杉矶' }))).toHaveLength(0);
    expect(await validate(plainToInstance(SearchCustomerRatesDto, { polCode: '深圳' }))).not.toHaveLength(0);
    expect(await validate(plainToInstance(SearchCustomerRatesDto, { pol: '深'.repeat(151) }))).not.toHaveLength(0);
  });
});
