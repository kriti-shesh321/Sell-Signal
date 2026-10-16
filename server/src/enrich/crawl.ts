import type { DomainCache, SiteStatus } from './cache.js';
import { fetchUrl, type FetcherOptions, type FetchResult } from './fetcher.js';
import { discoverPages } from './pages.js';
import { robotsGate } from './robots.js';

export type PageRole = 'home' | 'about' | 'contact';

export interface PageMeta {
  role: PageRole;
  url: string;
  path: string;
  result: FetchResult['kind'];
  httpStatus?: number;
  ms: number;
  attempts: number;
  reason?: string;
}

export interface FetchedPage {
  role: PageRole;
  url: string;
  path: string;
  html: string;
}

/** What goes into domain_cache.data: page metadata plus whatever the extractor returns. No raw HTML. */
export interface SiteSnapshot<F = unknown> {
  /** Extractor version that produced `facts`; a different version makes the cache entry a miss. */
  version: number;
  status: SiteStatus;
  finalUrl: string | null;
  https: boolean | null;
  reason: string | null;
  pages: PageMeta[];
  crawlDelayMs: number | null;
  facts: F | null;
}

export interface CrawlOutcome<F = unknown> extends SiteSnapshot<F> {
  domain: string;
  cached: boolean;
  /** When the site was actually crawled (the cache row's time for cached results). */
  crawledAt: Date;
  /** HTML of fetched pages (fresh crawls only); used by the extractors, never cached. */
  html: FetchedPage[];
  ms: number;
}

export interface CrawlDeps<F> {
  fetcher: FetcherOptions;
  cache: DomainCache;
  /** Turns fetched pages into facts worth caching (the extractors). */
  extract?: (pages: FetchedPage[], finalUrl: string) => F | Promise<F>;
  /** Bump when the extractor's output changes, so older cached facts are re-crawled. */
  version?: number;
  /** Gap between page requests to the same site (raised by robots.txt Crawl-delay, capped at 5 s). */
  pageGapMs?: number;
  sleep?: (ms: number) => Promise<void>;
  /** Skip the cache read (still writes the fresh result). */
  fresh?: boolean;
}

const defaultSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

const meta = (role: PageRole, r: FetchResult): PageMeta => {
  const url = 'finalUrl' in r ? r.finalUrl : r.url;
  return {
    role,
    url,
    path: new URL(url).pathname,
    result: r.kind,
    ...('httpStatus' in r && r.httpStatus !== undefined ? { httpStatus: r.httpStatus } : {}),
    ms: r.ms,
    attempts: r.attempts,
    ...('reason' in r ? { reason: r.reason } : {}),
  };
};

/**
 * A cached snapshot is reused only if it was made by the current extractor version and,
 * for a reachable site, actually carries extracted facts.
 */
export function isUsable(snapshot: Partial<SiteSnapshot>, version: number, expectFacts: boolean): boolean {
  if (snapshot.version !== version) return false;
  if (expectFacts && snapshot.status === 'ok' && (snapshot.facts === null || snapshot.facts === undefined)) return false;
  return true;
}

/**
 * Visit one company website politely: cache → robots.txt → homepage → at most one about-like
 * and one contact-like page (max 3 pages, sequential). Blocks are recorded, never bypassed.
 */
export async function crawlSite<F = unknown>(domain: string, deps: CrawlDeps<F>): Promise<CrawlOutcome<F>> {
  const started = Date.now();
  const sleep = deps.sleep ?? defaultSleep;

  const version = deps.version ?? 0;
  if (!deps.fresh) {
    const hit = await deps.cache.get<SiteSnapshot<F>>(domain);
    if (hit && isUsable(hit.data, version, Boolean(deps.extract))) {
      return { ...hit.data, domain, cached: true, crawledAt: hit.fetchedAt, html: [], ms: Date.now() - started };
    }
  }

  const done = async (partial: Omit<SiteSnapshot<F>, 'version'>, html: FetchedPage[] = []): Promise<CrawlOutcome<F>> => {
    const snapshot: SiteSnapshot<F> = { version, ...partial };
    await deps.cache.put(domain, snapshot, snapshot.status);
    return { ...snapshot, domain, cached: false, crawledAt: new Date(started), html, ms: Date.now() - started };
  };
  const empty = { finalUrl: null, https: null, pages: [], crawlDelayMs: null, facts: null };

  // robots.txt first: https, falling back to http for sites without TLS.
  const gate = robotsGate(deps.fetcher);
  let origin = `https://${domain}`;
  let robots = await gate.get(origin);
  if (robots.state === 'unreachable') {
    origin = `http://${domain}`;
    robots = await gate.get(origin);
  }
  if (robots.state === 'blocked') return done({ ...empty, status: 'blocked', reason: `robots.txt: ${robots.reason}` });
  if (robots.state === 'unreachable') return done({ ...empty, status: 'unreachable', reason: robots.reason });
  if (!robots.isAllowed(new URL('/', origin))) {
    return done({ ...empty, status: 'robots_disallowed', reason: 'robots.txt disallows /', crawlDelayMs: robots.crawlDelayMs });
  }

  const fetcher: FetcherOptions = { ...deps.fetcher, allow: (u) => gate.allow(u) };
  const gap = Math.min(Math.max(deps.pageGapMs ?? 300, robots.crawlDelayMs ?? 0), 5000);

  const home = await fetchUrl(new URL('/', origin), fetcher);
  const pages: PageMeta[] = [meta('home', home)];
  if (home.kind !== 'ok') {
    let status: SiteStatus = 'unreachable';
    let reason: string;
    switch (home.kind) {
      case 'blocked':
        status = 'blocked';
        reason = home.reason;
        break;
      case 'disallowed':
        status = 'robots_disallowed';
        reason = 'robots.txt disallows the redirect target';
        break;
      case 'unreachable':
        reason = home.reason;
        break;
      case 'http_error':
        reason = `homepage returned HTTP ${home.httpStatus}`;
        break;
      case 'not_html':
        reason = `homepage is not HTML (${home.contentType})`;
        break;
    }
    return done({ ...empty, status, reason, pages, crawlDelayMs: robots.crawlDelayMs });
  }

  const html: FetchedPage[] = [{ role: 'home', url: home.finalUrl, path: new URL(home.finalUrl).pathname, html: home.body }];
  const links = discoverPages(home.body, home.finalUrl);
  for (const role of ['about', 'contact'] as const) {
    const link = links[role];
    if (!link) continue;
    await sleep(gap);
    const res = await fetchUrl(link, fetcher);
    pages.push(meta(role, res));
    if (res.kind === 'ok') html.push({ role, url: res.finalUrl, path: new URL(res.finalUrl).pathname, html: res.body });
  }

  const facts = deps.extract ? await deps.extract(html, home.finalUrl) : null;
  return done(
    {
      status: 'ok',
      finalUrl: home.finalUrl,
      https: new URL(home.finalUrl).protocol === 'https:',
      reason: null,
      pages,
      crawlDelayMs: robots.crawlDelayMs,
      facts,
    },
    html,
  );
}
