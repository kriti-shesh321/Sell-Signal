import type { DomainCache, SiteStatus } from '../cache.js';
import type { FetchedPage } from '../crawl.js';
import { visibleText } from '../extract/util.js';
import { AI_VERSION, groundAnswer, type AiFacts } from './ground.js';
import type { AiAnswer, AiInput, PageText } from './prompt.js';

export type { AiFacts } from './ground.js';

export interface AiClient {
  model: string;
  extract(input: AiInput): Promise<AiAnswer>;
}

export interface AiStats {
  enabled: boolean;
  model: string | null;
  /** Provider calls made in this run (capped at AI_MAX_CALLS_PER_RUN). */
  calls: number;
  /** Sites whose earlier AI answer was reused from domain_cache. */
  cached: number;
  /** Empty lead fields the AI filled after the grounding guard. */
  filled: { ownerName: number; yearFounded: number; familyOwned: number };
  /** Suggestions the grounding guard threw out. */
  rejected: number;
  errors: number;
  /** Sites skipped because the per-run cap was reached. */
  skippedCap: number;
  /** Why the AI pass stopped early (quota, bad key), if it did. */
  stopped: string | null;
}

export const disabledAiStats = (): AiStats => ({
  enabled: false,
  model: null,
  calls: 0,
  cached: 0,
  filled: { ownerName: 0, yearFounded: 0, familyOwned: 0 },
  rejected: 0,
  errors: 0,
  skippedCap: 0,
  stopped: null,
});

/** What the AI pass needs from the site visit. */
export interface AiSite {
  status: SiteStatus;
  /** Pages from a fresh crawl; empty when the site came from the cache. */
  html?: FetchedPage[];
  /** An earlier AI answer stored with the cached snapshot (reused only if made by the current AI_VERSION). */
  ai?: AiFacts;
}

export interface AiRunDeps {
  client: AiClient;
  maxCalls: number;
  cache: DomainCache;
  /** Re-fetch a cached site's pages (the cache keeps facts, not HTML). Also refreshes the cache row. */
  recrawl: (domain: string) => Promise<{ status: SiteStatus; html: FetchedPage[] }>;
  /** HTTP status of a provider error, if any. */
  errorStatus?: (err: unknown) => number | null;
  /** Waits for a free slot under the provider's requests-per-minute limit (shared by all runs). */
  pace?: () => Promise<void>;
  now?: () => Date;
  log?: (msg: string) => void;
}

export interface AiRun {
  stats: AiStats;
  /** Ask the model about one site, at most once per domain while it's cached. Never throws. */
  fill(domain: string, site: AiSite, company: string | null): Promise<AiFacts | null>;
}

/**
 * Space provider calls evenly to stay under a requests-per-minute limit (Gemini's free tier allows 15).
 * Each caller gets the next free slot; one limiter is shared by every run in the process.
 */
export function rateLimiter(perMinute: number, sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms)), now = () => Date.now()) {
  const gap = Math.ceil(60_000 / perMinute);
  let next = 0;
  return async () => {
    const t = now();
    const slot = Math.max(t, next);
    next = slot + gap;
    if (slot > t) await sleep(slot - t);
  };
}

const MIN_TEXT = 200;
const ROLE_ORDER = ['about', 'home', 'contact'] as const;

const toPageTexts = (pages: FetchedPage[]): PageText[] =>
  [...pages]
    .sort((a, b) => ROLE_ORDER.indexOf(a.role) - ROLE_ORDER.indexOf(b.role))
    .map((p) => ({ source: `website:${p.path}`, text: visibleText(p.html) }))
    .filter((p) => p.text.length > 0);

/**
 * Optional LLM fallback for one run, used only when the rules left owner or founding year empty.
 * Answers go through the grounding guard and are cached per domain; provider errors are counted and
 * skipped, so the rules-only result always stands. A quota or key error stops further calls.
 */
export function createAiRun(deps: AiRunDeps): AiRun {
  const stats: AiStats = { ...disabledAiStats(), enabled: true, model: deps.client.model };
  const log = deps.log ?? (() => {});

  return {
    stats,
    async fill(domain, site, company) {
      if (site.status !== 'ok') return null;
      if (site.ai?.version === AI_VERSION) {
        stats.cached++;
        return site.ai;
      }
      if (stats.stopped) return null;
      if (stats.calls >= deps.maxCalls) {
        stats.skippedCap++;
        return null;
      }
      stats.calls++; // reserve the call before any await so concurrent sites respect the cap

      try {
        let html = site.html ?? [];
        if (!html.length) {
          const again = await deps.recrawl(domain);
          if (again.status !== 'ok') return release();
          html = again.html;
        }
        const pages = toPageTexts(html);
        if (pages.reduce((n, p) => n + p.text.length, 0) < MIN_TEXT) return release();

        await deps.pace?.();
        if (stats.stopped) return release();
        const answer = await deps.client.extract({ company, pages });
        const facts = groundAnswer(answer, pages, { model: deps.client.model, now: deps.now?.() });
        stats.rejected += facts.rejected.length;
        if (facts.rejected.length) log(`ai ${domain}: rejected ${facts.rejected.join('; ')}`);

        const entry = await deps.cache.get<Record<string, unknown>>(domain);
        if (entry) await deps.cache.put(domain, { ...entry.data, ai: facts }, entry.status);
        return facts;
      } catch (err) {
        stats.errors++;
        const status = deps.errorStatus?.(err) ?? null;
        if (status === 429) stats.stopped = 'rate limit or quota reached';
        else if (status === 401 || status === 403) stats.stopped = 'API key rejected';
        log(`ai ${domain} failed${status ? ` (HTTP ${status})` : ''}: ${err instanceof Error ? err.message : String(err)}`);
        return null;
      }
    },
  };

  /** Nothing to send after all: give the reserved call back. */
  function release() {
    stats.calls--;
    return null;
  }
}
