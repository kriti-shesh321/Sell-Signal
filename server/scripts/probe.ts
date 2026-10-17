// Crawl one company website the way the enrichment job will, using the real domain_cache table.
// Needs network access and DATABASE_URL (server/.env). Usage: npm run probe -- <domain> [--fresh]
import { loadConfig } from '../src/config.js';
import { createDb } from '../src/db/pool.js';
import { migrate } from '../src/db/migrate.js';
import { pgDomainCache } from '../src/enrich/cache.js';
import { crawlSite } from '../src/enrich/crawl.js';
import { EXTRACTOR_VERSION, extractSite, type SiteFacts } from '../src/enrich/extract/index.js';
import { configureNetwork } from '../src/net.js';
import { domain as toDomain } from '../src/pipeline/normalize.js';

function printFacts(f: SiteFacts) {
  const row = (label: string, v: { value: unknown; source: string; method: string; evidence: string } | null) =>
    console.log(`  ${label.padEnd(14)} ${v ? `${JSON.stringify(v.value)}  ← ${v.source} (${v.method}) "${v.evidence}"` : '—'}`);
  console.log('  extracted:');
  row('yearFounded', f.yearFounded);
  row('ownerName', f.ownerName);
  row('phone', f.phone);
  row('email', f.email);
  row('address', f.address);
  row('familyOwned', f.signals.familyOwned);
  row('franchise', f.signals.franchise);
  row('nonprofit', f.signals.nonprofit);
  row('copyrightYear', f.signals.copyrightYear);
  console.log(`  ${'viewport'.padEnd(14)} ${f.signals.hasViewport} · https ${f.signals.https}`);
}

const args = process.argv.slice(2);
const input = args.find((a) => !a.startsWith('--'));
const domain = toDomain(input);
if (!domain) {
  console.error('Usage: npm run probe -- <domain or URL> [--fresh]');
  process.exit(1);
}

try {
  process.loadEnvFile();
} catch {
  // no .env file: rely on the real environment
}
configureNetwork();
const config = loadConfig();
const db = createDb(config.DATABASE_URL);

try {
  await migrate(db);
  const result = await crawlSite(domain, {
    fetcher: { userAgent: config.USER_AGENT, timeoutMs: config.FETCH_TIMEOUT_MS },
    cache: pgDomainCache(db, { days: config.CACHE_TTL_DAYS, unreachableDays: config.CACHE_TTL_UNREACHABLE_DAYS }),
    fresh: args.includes('--fresh'),
    extract: (pages, finalUrl) => extractSite(pages, finalUrl),
    version: EXTRACTOR_VERSION,
  });
  const ago = (d: Date) => {
    const min = Math.round((Date.now() - d.getTime()) / 60_000);
    return min < 1 ? 'just now' : min < 60 ? `${min} min ago` : min < 2880 ? `${Math.round(min / 60)} h ago` : `${Math.round(min / 1440)} days ago`;
  };
  const cachedNote = result.cached ? ` (cached, crawled ${ago(result.crawledAt)}; no requests sent)` : '';
  console.log(`${result.domain}: ${result.status}${cachedNote} in ${result.ms} ms`);
  if (result.cached && result.pages.length) console.log('  page timings below are from that crawl; use --fresh to crawl again');
  if (result.reason) console.log(`  reason: ${result.reason}`);
  if (result.finalUrl) console.log(`  final URL: ${result.finalUrl} · https: ${result.https ? 'yes' : 'no'}`);
  if (result.crawlDelayMs) console.log(`  robots.txt crawl-delay: ${result.crawlDelayMs} ms`);
  for (const p of result.pages) {
    const extra = [p.httpStatus && `HTTP ${p.httpStatus}`, `${p.ms} ms`, p.attempts > 1 && `${p.attempts} attempts`, p.reason]
      .filter(Boolean)
      .join(', ');
    console.log(`  ${p.role.padEnd(7)} ${p.result.padEnd(11)} ${p.path}  (${extra})`);
  }
  if (result.facts) printFacts(result.facts);
} finally {
  await db.close();
}
