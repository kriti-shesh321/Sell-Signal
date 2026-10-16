import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import seedFile from './seed-domains.json' with { type: 'json' };
import { parseCsv } from './csv.js';
import type { SourceAdapter } from './types.js';
import type { RawLead } from '../types.js';

export interface SeedCompany {
  name: string;
  domain: string;
  industry: string;
  city: string | null;
  state: string;
}

export const SEED_DESCRIPTION: string = seedFile.description;
export const SEED_COMPANIES: readonly SeedCompany[] = seedFile.companies;

export function seedLeads(max = Infinity): RawLead[] {
  return SEED_COMPANIES.slice(0, max).map((c) => ({
    source: 'seed',
    raw: { ...c },
    company: c.name,
    website: c.domain,
    city: c.city,
    state: c.state,
    industry: c.industry,
  }));
}

export function seedAdapter(opts: { max?: number } = {}): SourceAdapter<void> {
  return { name: 'seed', load: async () => seedLeads(opts.max) };
}

const SAMPLE_CSV_PATH = fileURLToPath(new URL('./sample-synthetic.csv', import.meta.url));

export const readSampleCsv = () => readFile(SAMPLE_CSV_PATH, 'utf8');

/** The demo "sample" run: the synthetic SaaSquatch-format CSV plus the seed list, as one input. */
export async function sampleLeads(): Promise<RawLead[]> {
  return [...parseCsv(await readSampleCsv()).leads, ...seedLeads()];
}
