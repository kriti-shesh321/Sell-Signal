import { parse } from 'csv-parse/sync';
import type { SourceAdapter } from './types.js';
import type { RawLead } from '../types.js';

type MappedField = 'company' | 'website' | 'phone' | 'email' | 'street' | 'city' | 'state' | 'industry' | 'yearFounded' | 'ownerName';

/** Header aliases, keyed by the header lowercased with everything but letters/digits removed. */
const HEADER_ALIASES: Record<string, MappedField> = {
  company: 'company', companyname: 'company', name: 'company', businessname: 'company', business: 'company',
  website: 'website', url: 'website', domain: 'website', companywebsite: 'website', websiteurl: 'website', companydomainname: 'website',
  companyphone: 'phone', phone: 'phone', phonenumber: 'phone', telephone: 'phone',
  email: 'email', companyemail: 'email', emailaddress: 'email',
  street: 'street', address: 'street', streetaddress: 'street',
  city: 'city',
  state: 'state', stateregion: 'state', province: 'state',
  industry: 'industry',
  yearfounded: 'yearFounded', founded: 'yearFounded', foundedyear: 'yearFounded', foundingyear: 'yearFounded',
  owner: 'ownerName', ownername: 'ownerName', ownerfounder: 'ownerName', founder: 'ownerName',
};

export const COMPANY_HEADERS = ['company', 'company name', 'name', 'business name'];

export type CsvErrorCode = 'CSV_EMPTY' | 'CSV_PARSE' | 'CSV_NO_COMPANY_COLUMN' | 'CSV_TOO_MANY_ROWS';

export class CsvImportError extends Error {
  constructor(
    public readonly code: CsvErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'CsvImportError';
  }
}

export interface CsvParseResult {
  leads: RawLead[];
  rows: number;
  /** Rows with neither a company name nor a website. */
  skipped: number;
  warnings: string[];
}

export const headerKey = (header: string) => header.toLowerCase().replace(/[^a-z0-9]/g, '');

const isBlank = (v: string | undefined) => !v || !v.trim() || /^(n\/a|na|nan|null|none|-)$/i.test(v.trim());

/** Parse a SaaSquatch-style (or any similar) CSV export into RawLeads. */
export function parseCsv(text: string, opts: { maxRows?: number; recommendedRows?: number } = {}): CsvParseResult {
  const maxRows = opts.maxRows ?? 200;
  const recommended = opts.recommendedRows ?? 50;
  // Leading "# ..." lines are file comments (e.g. the synthetic-sample label).
  const body = text.replace(/^﻿/, '').replace(/^(?:[ \t]*#[^\n]*\r?\n)+/, '');

  let records: string[][];
  try {
    records = parse(body, { bom: true, relax_column_count: true, skip_empty_lines: true, trim: true });
  } catch (err) {
    throw new CsvImportError('CSV_PARSE', `Couldn't read this CSV: ${err instanceof Error ? err.message : String(err)}`);
  }
  const [header, ...dataRows] = records;
  if (!header || dataRows.length === 0) throw new CsvImportError('CSV_EMPTY', 'The file has no data rows.');

  const columnFor = new Map<MappedField, number>();
  let ownerHeader = '';
  header.forEach((h, i) => {
    const field = HEADER_ALIASES[headerKey(h)];
    if (field && !columnFor.has(field)) {
      columnFor.set(field, i);
      if (field === 'ownerName') ownerHeader = headerKey(h);
    }
  });
  if (!columnFor.has('company')) {
    throw new CsvImportError(
      'CSV_NO_COMPANY_COLUMN',
      `Couldn't find a company name column (looked for: ${COMPANY_HEADERS.join(', ')}).`,
    );
  }

  const rows = dataRows.filter((r) => r.some((cell) => cell.trim() !== ''));
  if (rows.length > maxRows) {
    throw new CsvImportError('CSV_TOO_MANY_ROWS', `The file has ${rows.length} rows; the limit is ${maxRows}.`);
  }

  const leads: RawLead[] = [];
  let skipped = 0;
  for (const row of rows) {
    const get = (f: MappedField) => {
      const i = columnFor.get(f);
      return i === undefined ? null : (row[i] ?? null);
    };
    if (isBlank(get('company') ?? undefined) && isBlank(get('website') ?? undefined)) {
      skipped++;
      continue;
    }
    const raw = Object.fromEntries(header.map((h, i) => [h, row[i] ?? '']));
    leads.push({
      source: 'csv',
      raw,
      company: get('company'),
      website: get('website'),
      phone: get('phone'),
      email: get('email'),
      street: get('street'),
      city: get('city'),
      state: get('state'),
      industry: get('industry'),
      yearFounded: get('yearFounded'),
      ownerName: get('ownerName'),
      ownerRole: ownerHeader === 'founder' ? 'founder' : 'owner',
    });
  }

  const warnings: string[] = [];
  if (leads.length > recommended) warnings.push(`More than ${recommended} rows: the run will take a few minutes.`);
  if (skipped) warnings.push(`${skipped} row(s) had no company name or website and were skipped.`);
  return { leads, rows: rows.length, skipped, warnings };
}

export function csvAdapter(opts: { maxRows?: number } = {}): SourceAdapter<{ text: string }> {
  return {
    name: 'csv',
    async load({ text }) {
      return parseCsv(text, opts).leads;
    },
  };
}
