import { describe, expect, it } from 'vitest';
import { CsvImportError, parseCsv } from '../../src/sources/csv.js';

const expectCsvError = (fn: () => unknown, code: string) => {
  try {
    fn();
  } catch (err) {
    expect(err).toBeInstanceOf(CsvImportError);
    expect((err as CsvImportError).code).toBe(code);
    return;
  }
  throw new Error(`expected CsvImportError ${code}`);
};

describe('parseCsv', () => {
  it('reads the SaaSquatch export columns', () => {
    const csv = [
      'company,website,industry,employees,revenue,yearFounded,productCategory,businessType,bbbRating,street,city,state,companyPhone,companyLinkedin,aiScore,matched_keywords,descriptive_keywords,aiExplanation',
      'Laboratory Schools,https://www.ucls.uchicago.edu,Schools,,N/A,N/A,,N/A,N/A,N/A,Chicago,IL,N/A,,N/A,N/A,N/A,N/A',
    ].join('\n');
    const { leads, rows } = parseCsv(csv);
    expect(rows).toBe(1);
    expect(leads[0]).toMatchObject({
      source: 'csv',
      company: 'Laboratory Schools',
      website: 'https://www.ucls.uchicago.edu',
      city: 'Chicago',
      state: 'IL',
      phone: 'N/A',
    });
    expect(leads[0]!.raw).toMatchObject({ aiScore: 'N/A', bbbRating: 'N/A' });
  });

  it.each([
    ['Company,Company Phone,Website', 'Acme Plumbing,(214) 555-0101,acme.com'],
    ['company,companyPhone,website', 'Acme Plumbing,(214) 555-0101,acme.com'],
    ['COMPANY NAME,PHONE NUMBER,URL', 'Acme Plumbing,(214) 555-0101,acme.com'],
    ['Business Name,Phone,Domain', 'Acme Plumbing,(214) 555-0101,acme.com'],
  ])('matches headers case-insensitively with aliases: %s', (header, row) => {
    const { leads } = parseCsv(`${header}\n${row}`);
    expect(leads[0]).toMatchObject({ company: 'Acme Plumbing', phone: '(214) 555-0101', website: 'acme.com' });
  });

  it('maps State/Region, Year Founded and Owner/Founder', () => {
    const { leads } = parseCsv('Company,State/Region,Year Founded,Owner/Founder\nAcme,Texas,1985,Jane Doe');
    expect(leads[0]).toMatchObject({ state: 'Texas', yearFounded: '1985', ownerName: 'Jane Doe' });
  });

  it('an Owner column means owner; a Founder column means founder', () => {
    expect(parseCsv('Company,Owner\nAcme,Jane Doe').leads[0]).toMatchObject({ ownerName: 'Jane Doe', ownerRole: 'owner' });
    expect(parseCsv('Company,Founder\nAcme,Jane Doe').leads[0]).toMatchObject({ ownerName: 'Jane Doe', ownerRole: 'founder' });
  });

  it('handles a BOM, CRLF line endings, quoted commas and extra columns', () => {
    const csv = '﻿company,city,notes\r\n"Riteway Service Company, Inc.",San Antonio,"a, b"\r\n';
    const { leads } = parseCsv(csv);
    expect(leads[0]).toMatchObject({ company: 'Riteway Service Company, Inc.', city: 'San Antonio' });
    expect(leads[0]!.raw).toMatchObject({ notes: 'a, b' });
  });

  it('skips leading # comment lines', () => {
    const { leads } = parseCsv('# SYNTHETIC\n# second line\ncompany\nAcme');
    expect(leads).toHaveLength(1);
  });

  it('skips rows with neither company nor website and warns', () => {
    const { leads, skipped, warnings } = parseCsv('company,website,city\nN/A,N/A,Dallas\nAcme,,Dallas\n,,\n');
    expect(leads).toHaveLength(1);
    expect(skipped).toBe(1);
    expect(warnings.join(' ')).toMatch(/skipped/);
  });

  it('warns above the recommended size', () => {
    const rows = Array.from({ length: 51 }, (_, i) => `Company ${i}`).join('\n');
    expect(parseCsv(`company\n${rows}`).warnings.join(' ')).toMatch(/More than 50 rows/);
  });

  it('rejects a file without a company column', () => {
    expectCsvError(() => parseCsv('website,phone\nacme.com,2145550101'), 'CSV_NO_COMPANY_COLUMN');
  });

  it('rejects more than 200 rows', () => {
    const rows = Array.from({ length: 201 }, (_, i) => `Company ${i}`).join('\n');
    expectCsvError(() => parseCsv(`company\n${rows}`), 'CSV_TOO_MANY_ROWS');
  });

  it('rejects an empty file', () => {
    expectCsvError(() => parseCsv('company\n'), 'CSV_EMPTY');
    expectCsvError(() => parseCsv(''), 'CSV_EMPTY');
  });

  it('rejects malformed CSV', () => {
    expectCsvError(() => parseCsv('company\n"unterminated'), 'CSV_PARSE');
  });
});
