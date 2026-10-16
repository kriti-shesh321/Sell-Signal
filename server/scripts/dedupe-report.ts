// Prints the normalize + dedupe result for the OSM fixture and the sample run (synthetic CSV + seed list).
// Usage: npm run report:dedupe
import { readFileSync } from 'node:fs';
import { averageCompleteness } from '../src/pipeline/completeness.js';
import { dedupe } from '../src/pipeline/dedupe.js';
import { normalizeLead } from '../src/pipeline/normalize.js';
import { mapOsmElements, type OverpassResponse } from '../src/sources/osm.js';
import { sampleLeads } from '../src/sources/seed.js';
import type { RawLead } from '../src/types.js';

function report(title: string, raw: RawLead[]) {
  const { leads, stats } = dedupe(raw.map((l) => normalizeLead(l)));
  console.log(`\n=== ${title} ===`);
  console.log(
    `rows in: ${stats.rowsIn} ${JSON.stringify(stats.rowsInBySource)} → unique: ${stats.unique} ` +
      `(duplicates merged: ${stats.duplicatesMerged}, cross-source groups: ${stats.crossSourceGroups})`,
  );
  console.log(`average completeness after merge: ${averageCompleteness(leads)}%`);
  for (const l of leads.filter((x) => x.mergedFrom.length)) {
    console.log(`  • ${l.company} [${l.source}] ${l.domain ?? '(no domain)'} ${l.phone ?? ''}`);
    for (const m of l.mergedFrom) {
      console.log(`      ← ${m.source}: "${m.company}" matched on ${m.matchedOn.join(' + ')}`);
    }
  }
}

const fixture = JSON.parse(
  readFileSync(new URL('../test/fixtures/osm-test.json', import.meta.url), 'utf8'),
) as OverpassResponse;
report('OSM fixture (osm-test.json)', mapOsmElements(fixture, { defaultState: 'TX' }));
report('Sample run: synthetic CSV + seed list', await sampleLeads());
