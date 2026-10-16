import { MockAgent } from 'undici';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { fetchRobots, robotsGate } from '../../src/enrich/robots.js';
import type { FetcherOptions } from '../../src/enrich/fetcher.js';

const SITE = 'https://smith.test';
let agent: MockAgent;
let opts: FetcherOptions;

beforeEach(() => {
  agent = new MockAgent();
  agent.disableNetConnect();
  opts = { userAgent: 'SellSignal/0.1 (+https://github.com/x/y)', dispatcher: agent, sleep: async () => {} };
});
afterEach(() => agent.close());

const robots = (body: string, status = 200) =>
  agent.get(SITE).intercept({ path: '/robots.txt' }).reply(status, body, { headers: { 'content-type': 'text/plain' } });
const allowed = async (path: string) => {
  const r = await fetchRobots(SITE, opts);
  if (r.state !== 'ok') throw new Error(`robots state ${r.state}`);
  return r.isAllowed(new URL(path, SITE));
};

describe('fetchRobots', () => {
  it('disallow all blocks every path', async () => {
    robots('User-agent: *\nDisallow: /');
    expect(await allowed('/')).toBe(false);
  });

  it('disallowing /about only blocks that path', async () => {
    robots('User-agent: *\nDisallow: /about');
    const r = await fetchRobots(SITE, opts);
    expect(r.state === 'ok' && r.isAllowed(new URL('/', SITE))).toBe(true);
    expect(r.state === 'ok' && r.isAllowed(new URL('/about-us', SITE))).toBe(false);
  });

  it('applies a group for our UA token over the * group', async () => {
    robots('User-agent: *\nAllow: /\n\nUser-agent: SellSignal\nDisallow: /');
    expect(await allowed('/')).toBe(false);
  });

  it('a group for another bot does not apply to us', async () => {
    robots('User-agent: BadBot\nDisallow: /');
    expect(await allowed('/')).toBe(true);
  });

  it('404 robots.txt means allow all', async () => {
    robots('not found', 404);
    expect(await allowed('/anything')).toBe(true);
  });

  it('reads Crawl-delay', async () => {
    robots('User-agent: *\nCrawl-delay: 2');
    const r = await fetchRobots(SITE, opts);
    expect(r.state === 'ok' && r.crawlDelayMs).toBe(2000);
  });

  it('5xx robots.txt → unreachable (permission unknown)', async () => {
    agent.get(SITE).intercept({ path: '/robots.txt' }).reply(500, '').times(2);
    expect((await fetchRobots(SITE, opts)).state).toBe('unreachable');
  });

  it('a challenge on robots.txt → blocked', async () => {
    robots('<title>Just a moment...</title>', 503);
    expect((await fetchRobots(SITE, opts)).state).toBe('blocked');
  });

  it('follows a redirect to www and applies the rules there', async () => {
    agent.get(SITE).intercept({ path: '/robots.txt' }).reply(301, '', { headers: { location: 'https://www.smith.test/robots.txt' } });
    agent.get('https://www.smith.test').intercept({ path: '/robots.txt' }).reply(200, 'User-agent: *\nDisallow: /private');
    const r = await fetchRobots(SITE, opts);
    expect(r.state === 'ok' && r.isAllowed(new URL('/private/x', SITE))).toBe(false);
    expect(r.state === 'ok' && r.isAllowed(new URL('/about', SITE))).toBe(true);
  });
});

describe('robotsGate', () => {
  it('fetches robots.txt once per origin', async () => {
    robots('User-agent: *\nDisallow: /admin');
    const gate = robotsGate(opts);
    expect(await gate.allow(new URL('/about', SITE))).toBe(true);
    expect(await gate.allow(new URL('/admin', SITE))).toBe(false);
    // a second fetch would fail: the interceptor above replies only once
  });
});
