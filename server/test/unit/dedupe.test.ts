import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { dedupe } from '../../src/pipeline/dedupe.js';
import { completeness } from '../../src/pipeline/completeness.js';
import { normalizeLead } from '../../src/pipeline/normalize.js';
import { mapOsmElements, type OverpassResponse } from '../../src/sources/osm.js';
import { parseCsv } from '../../src/sources/csv.js';
import { readSampleCsv, sampleLeads, SEED_COMPANIES, seedLeads } from '../../src/sources/seed.js';
import type { RawLead } from '../../src/types.js';

const n = (leads: RawLead[]) => leads.map((l) => normalizeLead(l));
const lead = (over: Partial<RawLead>): RawLead => ({ source: 'csv', raw: {}, ...over });

describe('dedupe rules', () => {
  it('merges rows with the same domain', () => {
    const { leads } = dedupe(n([lead({ company: 'A', website: 'https://www.acme.com/x' }), lead({ company: 'B', website: 'acme.com' })]));
    expect(leads).toHaveLength(1);
    expect(leads[0]!.mergedFrom[0]!.matchedOn).toEqual(['domain']);
  });

  it('merges rows with the same phone in different formats', () => {
    const { leads } = dedupe(n([lead({ company: 'A', phone: '(214) 555-0101' }), lead({ company: 'B', phone: '+1 214.555.0101' })]));
    expect(leads).toHaveLength(1);
    expect(leads[0]!.mergedFrom[0]!.matchedOn).toEqual(['phone']);
  });

  it('merges same name + city, ignoring legal suffixes and case', () => {
    const { leads } = dedupe(
      n([lead({ company: 'Smith Plumbing, LLC', city: 'Dallas' }), lead({ company: 'smith plumbing', city: 'dallas' })]),
    );
    expect(leads).toHaveLength(1);
    expect(leads[0]!.mergedFrom[0]!.matchedOn).toEqual(['name+city']);
  });

  it('keeps same name in different cities apart', () => {
    const { leads } = dedupe(n([lead({ company: 'Smith Plumbing', city: 'Dallas' }), lead({ company: 'Smith Plumbing', city: 'Austin' })]));
    expect(leads).toHaveLength(2);
  });

  it('merges transitively (A~B by phone, B~C by domain)', () => {
    const { leads, stats } = dedupe(
      n([
        lead({ company: 'A', phone: '2145550101' }),
        lead({ company: 'B', phone: '2145550101', website: 'acme.com' }),
        lead({ company: 'C', website: 'www.acme.com' }),
      ]),
    );
    expect(leads).toHaveLength(1);
    expect(stats.duplicatesMerged).toBe(2);
  });

  it('keeps the most complete row and fills its gaps, with per-field sources', () => {
    const { leads } = dedupe(
      n([
        { source: 'seed', raw: {}, company: 'Acme Plumbing', website: 'acme.com' },
        { source: 'csv', raw: {}, company: 'Acme Plumbing LLC', website: 'http://acme.com/contact', phone: '214-555-0101', city: 'Dallas', state: 'TX' },
        { source: 'osm', raw: {}, company: 'Acme', phone: '2145550101', email: 'office@acme.com' },
      ]),
    );
    const m = leads[0]!;
    expect(m.company).toBe('Acme Plumbing LLC'); // from the most complete (CSV) row
    expect(m.email).toBe('office@acme.com'); // gap filled from OSM
    expect(m.fieldSources.company?.source).toBe('CSV import');
    expect(m.fieldSources.email?.source).toBe('OpenStreetMap');
    expect(m.sources).toEqual(['csv', 'osm', 'seed']);
    expect(m.source).toBe('csv+osm+seed');
    expect(m.mergedFrom.map((e) => e.source).sort()).toEqual(['osm', 'seed']);
    expect(m.raw).toHaveLength(3);
  });

  it('never merges rows that have no matching keys', () => {
    const { leads } = dedupe(n([lead({ company: 'A' }), lead({ company: 'A' })]));
    expect(leads).toHaveLength(2); // same name but no city: not enough to call it a duplicate
  });
});

describe('dedupe on real data', () => {
  it('osm-test.json: 50 rows → 49 unique (Elite Heating and Air listed twice)', () => {
    const fixture = JSON.parse(readFileSync(new URL('../fixtures/osm-test.json', import.meta.url), 'utf8')) as OverpassResponse;
    const { leads, stats } = dedupe(n(mapOsmElements(fixture, { defaultState: 'TX' })));
    expect(stats).toMatchObject({ rowsIn: 50, unique: 49, duplicatesMerged: 1, crossSourceGroups: 0 });
    const elite = leads.find((l) => l.domain === 'eliteaustinac.com')!;
    expect(elite.mergedFrom).toHaveLength(1);
    expect(elite.mergedFrom[0]!.matchedOn.sort()).toEqual(['domain', 'phone']);
  });

  it('seed list: 40 unique real domains', () => {
    expect(SEED_COMPANIES).toHaveLength(40);
    const { stats } = dedupe(n(seedLeads()));
    expect(stats.unique).toBe(40);
  });

  it('sample CSV + seed list: 52 rows → 45 unique, 5 cross-source duplicates, 2 within the CSV', async () => {
    const csv = parseCsv(await readSampleCsv());
    expect(csv.leads).toHaveLength(12);
    const { leads, stats } = dedupe(n(await sampleLeads()));
    expect(stats).toMatchObject({
      rowsIn: 52,
      rowsInBySource: { csv: 12, seed: 40 },
      unique: 45,
      duplicatesMerged: 7,
      crossSourceGroups: 5,
    });
    const csvOnlyGroupsWithDupes = leads.filter((l) => l.source === 'csv' && l.mergedFrom.length > 0);
    expect(csvOnlyGroupsWithDupes).toHaveLength(2);
  });
});

describe('completeness', () => {
  it('counts the 8 key fields', () => {
    const [l] = n([lead({ company: 'A', website: 'a.com', phone: '2145550101', city: 'Dallas', state: 'TX' })]);
    expect(completeness(l!)).toBe(50); // phone, domain, city, state
  });
});
