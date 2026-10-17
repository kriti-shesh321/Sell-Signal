import { describe, expect, it } from 'vitest';
import { isValidUsPhone, mxLookup, validateLead } from '../../src/validate/validate.js';

describe('isValidUsPhone (NANP)', () => {
  it.each(['2145550101', '9362285000', '8002238017'])('accepts %s', (p) => {
    expect(isValidUsPhone(p)).toBe(true);
  });
  it.each(['1145550101', '0145550101', '2141550101', '9115550101', '2149110101', '214555010', null])('rejects %s', (p) => {
    expect(isValidUsPhone(p)).toBe(false);
  });
});

describe('mxLookup', () => {
  it('returns the lowest-priority exchange', async () => {
    const mx = mxLookup(async () => [
      { exchange: 'mx2.smith.com', priority: 20 },
      { exchange: 'mx1.smith.com', priority: 10 },
    ]);
    expect(await mx('smith.com')).toBe('mx1.smith.com');
  });

  it('no records, errors and null MX → null', async () => {
    expect(await mxLookup(async () => [])('a.com')).toBeNull();
    expect(await mxLookup(async () => { throw Object.assign(new Error('queryMx ENOTFOUND'), { code: 'ENOTFOUND' }); })('b.com')).toBeNull();
    expect(await mxLookup(async () => [{ exchange: '.', priority: 0 }])('c.com')).toBeNull();
  });

  it('times out as "no"', async () => {
    const mx = mxLookup(() => new Promise(() => {}), 20);
    expect(await mx('slow.com')).toBeNull();
  });

  it('looks each domain up once per run', async () => {
    let calls = 0;
    const mx = mxLookup(async () => {
      calls++;
      return [{ exchange: 'mx.smith.com', priority: 1 }];
    });
    await Promise.all([mx('smith.com'), mx('SMITH.com'), mx('smith.com')]);
    expect(calls).toBe(1);
  });
});

describe('validateLead', () => {
  const mx = async (d: string) => (d === 'smith.com' ? 'mx.smith.com' : null);
  it('checks phone, email domain and state', async () => {
    expect(await validateLead({ phone: '2145550101', email: 'office@smith.com', state: 'TX', siteStatus: 'ok' }, mx)).toEqual({
      phoneValid: true,
      emailSyntax: true,
      emailDomainAcceptsMail: true,
      mxHost: 'mx.smith.com',
      stateValid: true,
      siteStatus: 'ok',
    });
  });
  it('missing values are null (unknown), not false', async () => {
    expect(await validateLead({ phone: null, email: null, state: null, siteStatus: 'no_website' }, mx)).toMatchObject({
      phoneValid: null,
      emailSyntax: null,
      emailDomainAcceptsMail: null,
      stateValid: null,
    });
  });
  it('a domain without MX does not accept email', async () => {
    expect((await validateLead({ phone: null, email: 'x@parked.com', state: 'TX', siteStatus: 'ok' }, mx)).emailDomainAcceptsMail).toBe(false);
  });
});
