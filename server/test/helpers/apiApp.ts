import { readFileSync } from 'node:fs';
import { createApp } from '../../src/app.js';
import { memoryRepo } from '../../src/db/memoryRepo.js';
import type { FetchedPage } from '../../src/enrich/crawl.js';
import { extractSite } from '../../src/enrich/extract/index.js';
import { JobRunner, type SiteResult } from '../../src/runs/job.js';
import type { SourceDeps } from '../../src/runs/loaders.js';
import { mapOsmElements, OverpassUnavailableError, type OverpassResponse } from '../../src/sources/osm.js';
import { readSampleCsv, seedLeads } from '../../src/sources/seed.js';
import { FIXTURE_SITES, NOW } from './fixtureLeads.js';

const osmFixture = JSON.parse(readFileSync(new URL('../fixtures/osm-test.json', import.meta.url), 'utf8')) as OverpassResponse;
const html = (f: string) => readFileSync(new URL(`../fixtures/html/${f}`, import.meta.url), 'utf8');

/** Crawl stub: saved pages for the fixture sites, a block and an unreachable site, everything else unreachable. */
export function stubCrawl(calls: string[] = [], delayMs = 0): (domain: string) => Promise<SiteResult> {
  return async (domain) => {
    calls.push(domain);
    if (delayMs) await new Promise((r) => setTimeout(r, delayMs));
    const site = FIXTURE_SITES.find((s) => s.domain === domain);
    if (site) {
      const pages: FetchedPage[] = site.pages.map(([role, path, file]) => ({ role, path, url: site.finalUrl + path.slice(1), html: html(file) }));
      return { status: 'ok', facts: extractSite(pages, site.finalUrl, NOW), cached: false, ms: 120 };
    }
    if (domain === 'vanderfordair.com') return { status: 'blocked', facts: null, cached: false, ms: 80 };
    return { status: 'unreachable', facts: null, cached: false, ms: 50 };
  };
}

export function testApp(opts: { overpassDown?: boolean; crawlCalls?: string[]; crawlDelayMs?: number } = {}) {
  const repo = memoryRepo();
  const runner = new JobRunner({
    repo,
    concurrency: 3,
    crawl: stubCrawl(opts.crawlCalls, opts.crawlDelayMs),
    mx: () => async (domain) => (domain === 'nomail.test' ? null : `mx.${domain}`),
    now: () => NOW,
    statsIntervalMs: 0,
  });
  const sources: SourceDeps = {
    discover: async (trade) => {
      if (opts.overpassDown) throw new OverpassUnavailableError(['overpass: HTTP 502', 'mirror: timeout']);
      return mapOsmElements(osmFixture, { defaultState: 'TX' }).filter((l) => l.industry === trade.key);
    },
    seed: () => seedLeads(),
    sampleCsv: readSampleCsv,
  };
  const limits = { maxDiscover: 40, maxCsvRows: 200, recommendedRows: 50 };
  const app = createApp({
    db: { ping: async () => {} },
    corsOrigins: ['http://localhost:5173'],
    version: 'test',
    aiFallback: 'off',
    limits,
    runs: { repo, runner, sources, limits, now: () => NOW },
  });
  return { app, repo, runner };
}
