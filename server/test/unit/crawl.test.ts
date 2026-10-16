import { readFileSync } from 'node:fs';
import { MockAgent } from 'undici';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { memoryDomainCache } from '../../src/enrich/cache.js';
import { crawlSite, type CrawlDeps } from '../../src/enrich/crawl.js';

const HTML = { headers: { 'content-type': 'text/html' } };
const TEXT = { headers: { 'content-type': 'text/plain' } };
const homeHtml = readFileSync(new URL('../fixtures/html/home-with-links.html', import.meta.url), 'utf8');

let agent: MockAgent;
let cache: ReturnType<typeof memoryDomainCache>;
let deps: CrawlDeps<{ pageCount: number }>;

beforeEach(() => {
  agent = new MockAgent();
  agent.disableNetConnect();
  cache = memoryDomainCache({ days: 7, unreachableDays: 1 });
  deps = {
    fetcher: { userAgent: 'SellSignal/test', dispatcher: agent, sleep: async () => {} },
    cache,
    sleep: async () => {},
    extract: (pages) => ({ pageCount: pages.length }),
  };
});
afterEach(() => agent.close());

const smith = () => agent.get('https://smithplumbing.com');

describe('crawlSite', () => {
  it('fetches robots + home + about + contact (max 3 pages), extracts, caches without HTML', async () => {
    smith().intercept({ path: '/robots.txt' }).reply(200, 'User-agent: *\nAllow: /', TEXT);
    smith().intercept({ path: '/' }).reply(200, homeHtml, HTML);
    smith().intercept({ path: '/about-us/' }).reply(200, '<p>Since 1985</p>', HTML);
    agent.get('https://www.smithplumbing.com').intercept({ path: '/robots.txt' }).reply(404, '');
    agent.get('https://www.smithplumbing.com').intercept({ path: '/contact' }).reply(200, '<a href="tel:1">x</a>', HTML);

    const r = await crawlSite('smithplumbing.com', deps);
    expect(r).toMatchObject({ status: 'ok', cached: false, https: true, facts: { pageCount: 3 } });
    expect(r.pages.map((p) => [p.role, p.result])).toEqual([
      ['home', 'ok'],
      ['about', 'ok'],
      ['contact', 'ok'],
    ]);
    expect(r.html).toHaveLength(3);

    const stored = await cache.get<Record<string, unknown>>('smithplumbing.com');
    expect(stored?.status).toBe('ok');
    expect(JSON.stringify(stored?.data)).not.toContain('<p>');
  });

  it('second call is served from the cache with no requests', async () => {
    smith().intercept({ path: '/robots.txt' }).reply(404, '');
    smith().intercept({ path: '/' }).reply(200, '<p>no links</p>', HTML);
    await crawlSite('smithplumbing.com', deps);
    const again = await crawlSite('smithplumbing.com', deps); // MockAgent would throw on any new request
    expect(again).toMatchObject({ status: 'ok', cached: true, facts: { pageCount: 1 } });
    expect(again.crawledAt).toEqual((await cache.get('smithplumbing.com'))!.fetchedAt);
  });

  it('robots.txt disallowing / → robots_disallowed with no page requests', async () => {
    smith().intercept({ path: '/robots.txt' }).reply(200, 'User-agent: *\nDisallow: /', TEXT);
    const r = await crawlSite('smithplumbing.com', deps);
    expect(r).toMatchObject({ status: 'robots_disallowed', pages: [] });
    expect((await cache.get('smithplumbing.com'))?.status).toBe('robots_disallowed');
  });

  it('a 403 homepage → blocked after exactly one request', async () => {
    smith().intercept({ path: '/robots.txt' }).reply(404, '');
    smith().intercept({ path: '/' }).reply(403, 'Forbidden');
    const r = await crawlSite('smithplumbing.com', deps);
    expect(r).toMatchObject({ status: 'blocked' });
    expect(r.pages[0]).toMatchObject({ result: 'blocked', attempts: 1 });
  });

  it('falls back to http when https is unreachable', async () => {
    const err = Object.assign(new Error('connect ECONNREFUSED'), { code: 'ECONNREFUSED' });
    smith().intercept({ path: '/robots.txt' }).replyWithError(err).times(2);
    const plain = agent.get('http://smithplumbing.com');
    plain.intercept({ path: '/robots.txt' }).reply(404, '');
    plain.intercept({ path: '/' }).reply(200, '<p>hi</p>', HTML);
    const r = await crawlSite('smithplumbing.com', deps);
    expect(r).toMatchObject({ status: 'ok', https: false, finalUrl: 'http://smithplumbing.com/' });
  });

  it('a timing-out site → unreachable (and cached as such)', async () => {
    const err = Object.assign(new Error('connect ETIMEDOUT'), { code: 'ETIMEDOUT' });
    smith().intercept({ path: '/robots.txt' }).replyWithError(err).times(2);
    agent.get('http://smithplumbing.com').intercept({ path: '/robots.txt' }).replyWithError(err).times(2);
    const r = await crawlSite('smithplumbing.com', deps);
    expect(r).toMatchObject({ status: 'unreachable', reason: 'ETIMEDOUT' });
    expect((await cache.get('smithplumbing.com'))?.status).toBe('unreachable');
  });

  it('skips pages robots.txt disallows but keeps the rest', async () => {
    smith().intercept({ path: '/robots.txt' }).reply(200, 'User-agent: *\nDisallow: /about', TEXT);
    smith().intercept({ path: '/' }).reply(200, '<a href="/about">About</a><a href="/contact">Contact</a>', HTML);
    smith().intercept({ path: '/contact' }).reply(200, '<p>call us</p>', HTML);
    const r = await crawlSite('smithplumbing.com', deps);
    expect(r.pages.map((p) => [p.role, p.result])).toEqual([
      ['home', 'ok'],
      ['about', 'disallowed'],
      ['contact', 'ok'],
    ]);
    expect(r.facts).toEqual({ pageCount: 2 });
  });

  it('honours robots Crawl-delay between pages (capped at 5 s)', async () => {
    const gaps: number[] = [];
    smith().intercept({ path: '/robots.txt' }).reply(200, 'User-agent: *\nCrawl-delay: 30', TEXT);
    smith().intercept({ path: '/' }).reply(200, '<a href="/about">About</a>', HTML);
    smith().intercept({ path: '/about' }).reply(200, '<p>about</p>', HTML);
    await crawlSite('smithplumbing.com', { ...deps, sleep: async (ms) => void gaps.push(ms) });
    expect(gaps).toEqual([5000]);
  });

  it('fresh: true ignores the cache but still writes it', async () => {
    await cache.put('smithplumbing.com', { version: 0, status: 'ok', pages: [], facts: { pageCount: 9 } }, 'ok');
    smith().intercept({ path: '/robots.txt' }).reply(404, '');
    smith().intercept({ path: '/' }).reply(200, '<p>new</p>', HTML);
    const r = await crawlSite('smithplumbing.com', { ...deps, fresh: true });
    expect(r.cached).toBe(false);
    expect((await cache.get<{ facts: unknown }>('smithplumbing.com'))?.data.facts).toEqual({ pageCount: 1 });
  });

  it('re-crawls when the cached snapshot came from another extractor version', async () => {
    await cache.put('smithplumbing.com', { version: 1, status: 'ok', pages: [], facts: { pageCount: 9 } }, 'ok');
    smith().intercept({ path: '/robots.txt' }).reply(404, '');
    smith().intercept({ path: '/' }).reply(200, '<p>v2</p>', HTML);
    const r = await crawlSite('smithplumbing.com', { ...deps, version: 2 });
    expect(r).toMatchObject({ cached: false, version: 2, facts: { pageCount: 1 } });
    expect((await cache.get<{ version: number }>('smithplumbing.com'))?.data.version).toBe(2);
  });

  it('re-crawls an ok snapshot that has no facts when an extractor is configured', async () => {
    await cache.put('smithplumbing.com', { version: 0, status: 'ok', pages: [], facts: null }, 'ok');
    smith().intercept({ path: '/robots.txt' }).reply(404, '');
    smith().intercept({ path: '/' }).reply(200, '<p>now with facts</p>', HTML);
    const r = await crawlSite('smithplumbing.com', deps);
    expect(r).toMatchObject({ cached: false, facts: { pageCount: 1 } });
  });

  it('reuses a fact-less snapshot for non-ok statuses (nothing to extract)', async () => {
    await cache.put('smithplumbing.com', { version: 0, status: 'blocked', pages: [], facts: null }, 'blocked');
    const r = await crawlSite('smithplumbing.com', deps); // MockAgent would throw on any request
    expect(r).toMatchObject({ cached: true, status: 'blocked' });
  });
});
