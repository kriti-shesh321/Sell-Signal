import { createApp } from './app.js';
import { loadConfig } from './config.js';
import { migrateWithRetry } from './db/migrate.js';
import { createDb } from './db/pool.js';
import { pgRepo } from './db/repo.js';
import { createAiRun, rateLimiter, type AiFacts } from './enrich/ai/index.js';
import { geminiClient, providerStatus } from './enrich/ai/gemini.js';
import { pgDomainCache } from './enrich/cache.js';
import { crawlSite } from './enrich/crawl.js';
import { EXTRACTOR_VERSION, extractSite, type SiteFacts } from './enrich/extract/index.js';
import { configureNetwork } from './net.js';
import { JobRunner } from './runs/job.js';
import { osmAdapter, OverpassUnavailableError } from './sources/osm.js';
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
await migrateWithRetry(db, { log: (m) => console.log(`[db] ${m}`) });
console.log('migrations applied');

const repo = pgRepo(db);
const orphaned = await repo.failOrphanedRuns('The server restarted while this run was in progress. Start it again.');
if (orphaned) console.log(`marked ${orphaned} interrupted run(s) as failed`);

const cache = pgDomainCache(db, { days: config.CACHE_TTL_DAYS, unreachableDays: config.CACHE_TTL_UNREACHABLE_DAYS });
const fetcher = { userAgent: config.USER_AGENT, timeoutMs: config.FETCH_TIMEOUT_MS };
const osm = osmAdapter({ urls: [config.OVERPASS_URL, config.OVERPASS_MIRROR_URL], userAgent: config.USER_AGENT, max: config.MAX_DISCOVER });

const crawl = (domain: string, fresh = false) =>
  crawlSite<SiteFacts>(domain, {
    fetcher,
    cache,
    extract: (pages, finalUrl) => extractSite(pages, finalUrl),
    version: EXTRACTOR_VERSION,
    fresh,
  });

const aiClient =
  config.AI_FALLBACK === 'on' && config.GEMINI_API_KEY ? geminiClient({ apiKey: config.GEMINI_API_KEY, model: config.AI_MODEL }) : null;
if (config.AI_FALLBACK === 'on' && !aiClient) console.warn('AI_FALLBACK=on but GEMINI_API_KEY is not set: AI fallback stays off');
if (aiClient) console.log(`AI fallback on (${aiClient.model}, max ${config.AI_MAX_CALLS_PER_RUN} calls per run, ${config.AI_REQUESTS_PER_MINUTE}/min)`);
const aiPace = rateLimiter(config.AI_REQUESTS_PER_MINUTE);

const runner = new JobRunner({
  repo,
  concurrency: config.CRAWL_CONCURRENCY,
  mx: () => mxLookup(),
  crawl: async (domain) => {
    const r = await crawl(domain);
    const ai = (r as { ai?: AiFacts }).ai;
    return { status: r.status, facts: r.facts, cached: r.cached, ms: r.ms, html: r.html, ...(ai ? { ai } : {}) };
  },
  ...(aiClient && {
    ai: () =>
      createAiRun({
        client: aiClient,
        maxCalls: config.AI_MAX_CALLS_PER_RUN,
        cache,
        recrawl: (domain) => crawl(domain, true),
        errorStatus: providerStatus,
        pace: aiPace,
        log: (msg) => console.log(`[ai] ${msg}`),
      }),
  }),
  log: (msg) => console.log(`[job] ${msg}`),
});

const limits = { maxDiscover: config.MAX_DISCOVER, maxCsvRows: 200, recommendedRows: 50 };
const app = createApp({
  db,
  corsOrigins: config.corsOrigins,
  version: process.env.npm_package_version ?? '0.1.0',
  aiFallback: aiClient ? 'on' : 'off',
  limits,
  runs: {
    repo,
    runner,
    limits,
    sources: {
      discover: (trade, state) =>
        osm.load({ trade, state }).catch((err: unknown) => {
          if (err instanceof OverpassUnavailableError) console.log(`[osm] ${trade.key}/${state} failed: ${err.attempts.join(' | ')}`);
          throw err;
        }),
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
