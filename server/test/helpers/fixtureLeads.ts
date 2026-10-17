import { readFileSync } from 'node:fs';
import type { FetchedPage } from '../../src/enrich/crawl.js';
import { extractSite } from '../../src/enrich/extract/index.js';
import { applySiteFacts, type EnrichedLead } from '../../src/pipeline/applyFacts.js';
import { dedupe } from '../../src/pipeline/dedupe.js';
import { normalizeLead } from '../../src/pipeline/normalize.js';
import { mapOsmElements, type OverpassResponse } from '../../src/sources/osm.js';

export const NOW = new Date('2026-06-01T00:00:00Z');

const html = (name: string) => readFileSync(new URL(`../fixtures/html/${name}`, import.meta.url), 'utf8');
const osm = JSON.parse(readFileSync(new URL('../fixtures/osm-test.json', import.meta.url), 'utf8')) as OverpassResponse;
const merged = dedupe(mapOsmElements(osm, { defaultState: 'TX' }).map((l) => normalizeLead(l, NOW))).leads;

/** The real sites we keep trimmed page fixtures for, with the page roles they were saved from. */
export const FIXTURE_SITES: Array<{ domain: string; finalUrl: string; pages: Array<[FetchedPage['role'], string, string]> }> = [
  { domain: 'yell4george.com', finalUrl: 'https://yell4george.com/', pages: [['about', '/about/', 'real-yell4george-about.html']] },
  { domain: 'bellomyims.com', finalUrl: 'https://www.bellomyims.com/', pages: [['about', '/about-us', 'real-bellomyims-about.html']] },
  { domain: 'eliteaustinac.com', finalUrl: 'https://eliteaustinac.com/', pages: [['about', '/about-us/', 'real-eliteaustinac-about.html']] },
  {
    domain: 'jdprecisionplumbing.com',
    finalUrl: 'https://www.jdprecisionplumbing.com/',
    pages: [
      ['home', '/', 'real-jdprecision-home.html'],
      ['about', '/about-us/', 'real-jdprecision-about.html'],
    ],
  },
  { domain: 'air-streamservices.com', finalUrl: 'https://www.air-streamservices.com/', pages: [['about', '/About-air-stream.html', 'real-airstream-about.html']] },
];

/** OSM row (from osm-test.json) + facts extracted from the saved pages, as the job would build it. */
export function fixtureLead(domain: string): EnrichedLead {
  const site = FIXTURE_SITES.find((s) => s.domain === domain)!;
  const lead = merged.find((l) => l.domain === domain)!;
  const pages: FetchedPage[] = site.pages.map(([role, path, file]) => ({ role, path, url: `${site.finalUrl.replace(/\/$/, '')}${path}`, html: html(file) }));
  return applySiteFacts(lead, { status: 'ok', facts: extractSite(pages, site.finalUrl, NOW) });
}
