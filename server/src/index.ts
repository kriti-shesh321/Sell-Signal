import { createApp } from './app.js';
import { loadConfig } from './config.js';
import { migrate } from './db/migrate.js';
import { createDb } from './db/pool.js';
import { pgRepo } from './db/repo.js';
import { pgDomainCache } from './enrich/cache.js';
import { crawlSite } from './enrich/crawl.js';
import { EXTRACTOR_VERSION, extractSite, type SiteFacts } from './enrich/extract/index.js';
import { configureNetwork } from './net.js';
import { JobRunner } from './runs/job.js';
import { osmAdapter } from './sources/osm.js';
import { readSampleCsv, seedLeads } from './sources/seed.js';
import { mxLookup } from './validate/validate.js';

try {
  process.loadEnvFile();
} catch {
  // no .env file: rely on the real environment (e.g. the host's environment variables)
}

configureNetwork();
const config = loadConfig();
const db = createDb(config.DATABASE_URL);
await migrate(db);
console.log('migrations applied');

const repo = pgRepo(db);
const orphaned = await repo.failOrphanedRuns('The server restarted while this run was in progress. Start it again.');
if (orphaned) console.log(`marked ${orphaned} interrupted run(s) as failed`);

const cache = pgDomainCache(db, { days: config.CACHE_TTL_DAYS, unreachableDays: config.CACHE_TTL_UNREACHABLE_DAYS });
const fetcher = { userAgent: config.USER_AGENT, timeoutMs: config.FETCH_TIMEOUT_MS };
const osm = osmAdapter({ urls: [config.OVERPASS_URL, config.OVERPASS_MIRROR_URL], userAgent: config.USER_AGENT, max: config.MAX_DISCOVER });

const runner = new JobRunner({
  repo,
  concurrency: config.CRAWL_CONCURRENCY,
  mx: () => mxLookup(),
  crawl: async (domain) => {
    const r = await crawlSite<SiteFacts>(domain, {
      fetcher,
      cache,
      extract: (pages, finalUrl) => extractSite(pages, finalUrl),
      version: EXTRACTOR_VERSION,
    });
    return { status: r.status, facts: r.facts, cached: r.cached, ms: r.ms };
  },
  log: (msg) => console.log(`[job] ${msg}`),
});

const limits = { maxDiscover: config.MAX_DISCOVER, maxCsvRows: 200, recommendedRows: 50 };
const app = createApp({
  db,
  corsOrigins: config.corsOrigins,
  version: process.env.npm_package_version ?? '0.1.0',
  aiFallback: config.AI_FALLBACK,
  limits,
  runs: {
    repo,
    runner,
    limits,
    sources: {
      discover: (trade, state) => osm.load({ trade, state }),
      seed: () => seedLeads(config.MAX_DISCOVER),
      sampleCsv: readSampleCsv,
    },
  },
});

const server = app.listen(config.PORT, () => {
  console.log(`SellSignal API listening on :${config.PORT}`);
});

const shutdown = () => {
  server.close(() => void db.close().then(() => process.exit(0)));
};
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
