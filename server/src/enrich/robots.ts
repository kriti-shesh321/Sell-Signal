import { createRequire } from 'node:module';
import { fetchUrl, type FetcherOptions } from './fetcher.js';

interface Robot {
  isAllowed(url: string, ua?: string): boolean | undefined;
  getCrawlDelay(ua?: string): number | undefined;
}
// robots-parser is CommonJS and its bundled types don't resolve under NodeNext; load it via require.
const robotsParser = createRequire(import.meta.url)('robots-parser') as (url: string, contents: string) => Robot;

export const ROBOTS_UA_TOKEN = 'SellSignal';

export type RobotsResult =
  | { state: 'ok'; isAllowed(url: URL): boolean; crawlDelayMs: number | null; robotsUrl: string }
  | { state: 'blocked'; reason: string }
  | { state: 'unreachable'; reason: string };

const allowAll = (robotsUrl: string): RobotsResult => ({ state: 'ok', isAllowed: () => true, crawlDelayMs: null, robotsUrl });

/**
 * Fetch and parse robots.txt for an origin (RFC 9309): 4xx = no rules (allow all),
 * 5xx / network failure = we can't confirm permission, so the site is treated as unreachable.
 */
export async function fetchRobots(origin: string, opts: FetcherOptions): Promise<RobotsResult> {
  const robotsUrl = new URL('/robots.txt', origin).href;
  const res = await fetchUrl(robotsUrl, { ...opts, maxBytes: 500_000, allow: undefined }, 'text');
  switch (res.kind) {
    case 'ok': {
      const robots = robotsParser(res.finalUrl, res.body);
      const delay = robots.getCrawlDelay(ROBOTS_UA_TOKEN);
      return {
        state: 'ok',
        robotsUrl: res.finalUrl,
        crawlDelayMs: typeof delay === 'number' && delay > 0 ? delay * 1000 : null,
        isAllowed(url: URL) {
          // robots.txt applies to its own origin; a redirect may have moved it (e.g. to www.)
          const target = new URL(url.pathname + url.search, res.finalUrl);
          return robots.isAllowed(target.href, ROBOTS_UA_TOKEN) !== false;
        },
      };
    }
    case 'http_error':
    case 'not_html':
      return allowAll(robotsUrl);
    case 'blocked':
      return { state: 'blocked', reason: res.reason };
    case 'disallowed':
      return allowAll(robotsUrl);
    case 'unreachable':
      return { state: 'unreachable', reason: res.reason };
  }
}

/** Per-origin robots.txt memo, so redirects to another host (e.g. www.) are checked against that host's rules. */
export function robotsGate(opts: FetcherOptions) {
  const byOrigin = new Map<string, Promise<RobotsResult>>();
  const get = (origin: string) => {
    let p = byOrigin.get(origin);
    if (!p) {
      p = fetchRobots(origin, opts);
      byOrigin.set(origin, p);
    }
    return p;
  };
  return {
    get,
    async allow(url: URL): Promise<boolean> {
      const r = await get(url.origin);
      return r.state === 'ok' ? r.isAllowed(url) : true; // fetch failures surface on the page fetch itself
    },
  };
}
