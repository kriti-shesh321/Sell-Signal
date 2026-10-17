import { describe, expect, it } from 'vitest';
import { clean, domain, email, foundingYear, nameKey, normalizeLead, phone, state } from '../../src/pipeline/normalize.js';

describe('clean', () => {
  it.each(['N/A', 'n/a', 'NaN', 'null', 'None', '-', '', '   ', undefined, null])('treats %j as missing', (v) => {
    expect(clean(v)).toBeNull();
  });
  it('trims and collapses whitespace', () => {
    expect(clean('  Smith   Plumbing ')).toBe('Smith Plumbing');
  });
});

describe('domain', () => {
  it.each([
    ['https://www.jdprecisionplumbing.com/', 'jdprecisionplumbing.com'],
    ['WWW.FROSTAC.COM', 'frostac.com'],
    ['frostac.com', 'frostac.com'],
    ['http://www.accur-ac.com/', 'accur-ac.com'],
    ['https://texassolarpowersystems.com/location/Plano', 'texassolarpowersystems.com'],
    ['https://www.johnstonesupply.com/store55?', 'johnstonesupply.com'],
    ['dandsplumbingtexas.com/?utm_source=directory', 'dandsplumbingtexas.com'],
    ['https://shop.example.com/x', 'example.com'],
    ['https://www2.example.com', 'example.com'],
    ['https://smith.co.uk/about', 'smith.co.uk'],
    ['https://smithplumbing.wixsite.com/home', 'smithplumbing.wixsite.com'],
  ])('%s → %s', (input, expected) => {
    expect(domain(input)).toBe(expected);
  });

  it.each(['N/A', 'https://www.facebook.com/Yell4George/', 'info@example.com', 'localhost', 'not a url', '192.168.0.1'])(
    'rejects %s',
    (input) => {
      expect(domain(input)).toBeNull();
    },
  );
});

describe('phone', () => {
  it.each([
    ['+1-936-228-5000', '9362285000'],
    ['(214) 555-0101', '2145550101'],
    ['214.555.0101 x12', '2145550101'],
    ['214-555-0101 ext. 4', '2145550101'],
    ['+12818688427', '2818688427'],
    ['+1-817- 581-1214', '8175811214'],
    ['+1 936 4628030', '9364628030'],
    ['+1-210-495-9991;+1-210-555-0000', '2104959991'],
  ])('%s → %s', (input, expected) => {
    expect(phone(input)).toBe(expected);
  });

  it.each(['555-0101', '21455501', 'N/A', '+44 20 7946 0958 12'])('rejects %s', (input) => {
    expect(phone(input)).toBeNull();
  });
});

describe('nameKey', () => {
  it('strips legal suffixes and punctuation', () => {
    expect(nameKey('Smith Plumbing, LLC.')).toBe('smith plumbing');
    expect(nameKey('smith plumbing')).toBe('smith plumbing');
    expect(nameKey('Fresh Air, L.P.')).toBe('fresh air');
    expect(nameKey('Riteway Service Company, Inc.')).toBe('riteway service');
  });
  it('treats & and "and" alike', () => {
    expect(nameKey('D&S Plumbing')).toBe(nameKey('D & S Plumbing'));
    expect(nameKey('A & B Air')).toBe(nameKey('A and B Air'));
  });
  it('keeps the name if it is only a suffix', () => {
    expect(nameKey('Co.')).toBe('co');
  });
});

describe('state', () => {
  it.each([
    ['Texas', 'TX'],
    ['tx', 'TX'],
    [' TX ', 'TX'],
    ['new york', 'NY'],
  ])('%s → %s', (input, expected) => {
    expect(state(input)).toBe(expected);
  });
  it('rejects unknown values', () => {
    expect(state('Texass')).toBeNull();
    expect(state('N/A')).toBeNull();
  });
});

describe('email', () => {
  it('lowercases and strips mailto', () => {
    expect(email('mailto:Info@Example.com')).toBe('info@example.com');
  });
  it('drops a www. host', () => {
    expect(email('service@www.jdprecisionplumbing.com')).toBe('service@jdprecisionplumbing.com');
  });
  it('rejects invalid and masked addresses', () => {
    expect(email('sc********@***********ac.com')).toBeNull();
    expect(email('not-an-email')).toBeNull();
    expect(email('N/A')).toBeNull();
  });
});

describe('foundingYear', () => {
  const now = new Date('2026-06-01');
  it('accepts 1900 to the current year', () => {
    expect(foundingYear('1900', now)).toBe(1900);
    expect(foundingYear('2026', now)).toBe(2026);
    expect(foundingYear('1996-04', now)).toBe(1996);
    expect(foundingYear(1985, now)).toBe(1985);
  });
  it('rejects years outside 1900..current', () => {
    expect(foundingYear('1899', now)).toBeNull();
    expect(foundingYear('2027', now)).toBeNull();
    expect(foundingYear('N/A', now)).toBeNull();
  });
});

describe('normalizeLead', () => {
  it('normalizes every field and builds the website from the root domain', () => {
    const lead = normalizeLead({
      source: 'csv',
      raw: {},
      company: ' Frost Brothers Heating and Air ',
      website: 'WWW.FROSTAC.COM/about',
      phone: '(972) 874-1001',
      email: 'N/A',
      city: 'Lewisville',
      state: 'Texas',
      industry: 'HVAC Services',
      yearFounded: 'NaN',
    });
    expect(lead).toMatchObject({
      company: 'Frost Brothers Heating and Air',
      domain: 'frostac.com',
      website: 'https://frostac.com/',
      phone: '9728741001',
      email: null,
      state: 'TX',
      industry: 'hvac',
      yearFounded: null,
      nameKey: 'frost brothers heating and air',
    });
  });
});
