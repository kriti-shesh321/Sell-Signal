// Crawl + extract every seed-list domain (5 at a time, using domain_cache) and print fill rates.
// Needs network access and DATABASE_URL. Usage: npm run report:extract [-- --fresh] [-- --limit 10]
import pLimit from 'p-limit';
import { loadConfig } from '../src/config.js';
import { migrate } from '../src/db/migrate.js';
import { createDb } from '../src/db/pool.js';
import { pgDomainCache } from '../src/enrich/cache.js';
import { crawlSite } from '../src/enrich/crawl.js';
import { EXTRACTOR_VERSION, extractSite, type SiteFacts } from '../src/enrich/extract/index.js';
import { configureNetwork } from '../src/net.js';
import { SEED_COMPANIES } from '../src/sources/seed.js';

const args = process.argv.slice(2);
const limitArg = args.indexOf('--limit');
const limit = limitArg >= 0 ? Number(args[limitArg + 1]) : SEED_COMPANIES.length;

try {
  process.loadEnvFile();
} catch {
  // no .env file
}
configureNetwork();
const config = loadConfig();
const db = createDb(config.DATABASE_URL);
await migrate(db);
const cache = pgDomainCache(db, { days: config.CACHE_TTL_DAYS, unreachableDays: config.CACHE_TTL_UNREACHABLE_DAYS });
const started = Date.now();

const run = pLimit(config.CRAWL_CONCURRENCY);
const results = await Promise.all(
  SEED_COMPANIES.slice(0, limit).map((c) =>
    run(() =>
      crawlSite<SiteFacts>(c.domain, {
        fetcher: { userAgent: config.USER_AGENT, timeoutMs: config.FETCH_TIMEOUT_MS },
        cache,
        fresh: args.includes('--fresh'),
        extract: (pages, finalUrl) => extractSite(pages, finalUrl),
        version: EXTRACTOR_VERSION,
      }),
    ),
  ),
);
await db.close();

const short = (v: { value: unknown } | null) => (v ? String(typeof v.value === 'object' ? 'yes' : v.value) : '·');
console.log('domain'.padEnd(34), 'status'.padEnd(12), 'year'.padEnd(5), 'owner'.padEnd(20), 'phone'.padEnd(11), 'email', '| fam fr np ©');
for (const r of results) {
  const f = r.facts;
  console.log(
    r.domain.padEnd(34),
    `${r.status}${r.cached ? '*' : ''}`.padEnd(12),
    short(f?.yearFounded ?? null).padEnd(5),
    short(f?.ownerName ?? null).slice(0, 19).padEnd(20),
    short(f?.phone ?? null).padEnd(11),
    short(f?.email ?? null).slice(0, 28).padEnd(28),
    '|',
    f ? [f.signals.familyOwned, f.signals.franchise, f.signals.nonprofit].map((s) => (s ? '✓' : '·')).join('  ') : '',
    short(f?.signals.copyrightYear ?? null),
  );
}

const ok = results.filter((r) => r.status === 'ok' && r.facts);
const pct = (n: number, d: number) => (d ? `${Math.round((n / d) * 100)}%` : '—');
const count = (fn: (f: SiteFacts) => unknown) => ok.filter((r) => fn(r.facts!)).length;
const statuses = results.reduce<Record<string, number>>((acc, r) => ({ ...acc, [r.status]: (acc[r.status] ?? 0) + 1 }), {});
console.log(`\n${results.length} sites in ${Math.round((Date.now() - started) / 1000)} s · ${JSON.stringify(statuses)} · * = cached`);
console.log(`fill rate over ${ok.length} reachable sites:`);
for (const [label, fn] of [
  ['yearFounded', (f: SiteFacts) => f.yearFounded],
  ['ownerName', (f: SiteFacts) => f.ownerName],
  ['phone', (f: SiteFacts) => f.phone],
  ['email', (f: SiteFacts) => f.email],
  ['address', (f: SiteFacts) => f.address],
  ['familyOwned', (f: SiteFacts) => f.signals.familyOwned],
  ['franchise', (f: SiteFacts) => f.signals.franchise],
  ['nonprofit', (f: SiteFacts) => f.signals.nonprofit],
  ['copyrightYear', (f: SiteFacts) => f.signals.copyrightYear],
] as const) {
  console.log(`  ${label.padEnd(14)} ${String(count(fn)).padStart(2)}/${ok.length}  ${pct(count(fn), ok.length)}`);
}
