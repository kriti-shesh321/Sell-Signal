import * as cheerio from 'cheerio';
import { email as normalizeEmail, phone as normalizePhone } from '../../pipeline/normalize.js';
import type { Found, FoundName, PageDoc } from './types.js';
import { personName, snippet, validYear, visibleText } from './util.js';

/** Visible text of a page, cached per document. */
const textCache = new WeakMap<PageDoc, string>();
export function pageText(page: PageDoc): string {
  let t = textCache.get(page);
  if (t === undefined) {
    t = visibleText(page.html);
    textCache.set(page, t);
  }
  return t;
}

const found = <T>(page: PageDoc, value: T, method: Found<T>['method'], evidence: string): Found<T> => ({
  value,
  source: page.source,
  method,
  evidence,
});

// ---- founding year -------------------------------------------------------------------------

// "since 1985", "Est. 1987", "established in 1994", "Founded in Conroe, TX in 2010", "opened our doors in 1979"
const YEAR_PHRASE =
  /\b(?:since|est\.?|in business since|serving [^.\n]{0,60}?since|dating back to|(?:our story|our company|our business|the company|the business) (?:began|started) in|(?:founded|established|started|opened(?: our doors| for business)?)(?:\s+in\s+[A-Z][\w .,'’-]{1,40}?)?(?:\s+in)?)\s*((?:19|20)\d{2})\b/gi;
const COPYRIGHT_NEAR = /©|&copy;|copyright|all rights reserved/i;

/**
 * Founding year from phrases like "since 1985", "Est. 1987", "founded in 1979". Years near a © are
 * ignored, only 1900…current year counts, and the earliest match wins ("since 2020 we've expanded"
 * doesn't override "founded in 1985").
 */
export function findYearFounded(pages: PageDoc[], now: Date): Found<number> | null {
  let best: Found<number> | null = null;
  for (const page of pages) {
    const text = pageText(page);
    for (const m of text.matchAll(YEAR_PHRASE)) {
      const year = Number(m[1]);
      const around = text.slice(Math.max(0, m.index - 40), m.index + m[0].length + 10);
      if (!validYear(year, now) || COPYRIGHT_NEAR.test(around)) continue;
      if (!best || year < best.value) best = found(page, year, 'text', snippet(text, m.index, m[0].length));
    }
  }
  return best;
}

// ---- owner name ----------------------------------------------------------------------------

const ROLE = String.raw`(?:[Oo]wner(?:\s*/\s*[Oo]perator)?|[Ff]ounder|[Cc]o-?[Ff]ounder|[Pp]resident|CEO|[Pp]roprietor)`;
// Names never span lines, so words are joined by spaces/tabs only.
const NAME = String.raw`([A-Z][\w'’.-]*(?:[ \t]+[A-Z][\w'’.-]*){1,4})`;
const OWNER_PATTERNS = [
  // "Owner: John Smith", "Founder & President, John Smith", "meet our owner John Smith"
  // "Owner and Master Plumber Tom Baker": up to 3 words may sit between the role and the name
  new RegExp(String.raw`\b${ROLE}(?:\s*(?:&|and)\s+(?:[A-Za-z-]+\s+){0,3}?)?\s*(?:[,:–—-]|\bis\b)?\s*${NAME}`, 'g'),
  // "John Smith, Owner", "John Smith – Founder"
  new RegExp(String.raw`${NAME}\s*[,–—-]\s*(?:the\s+|our\s+)?${ROLE}\b`, 'g'),
  // "owned and operated by John Smith", "founded by John Smith", "established in 1947 by George F. Saliba"
  new RegExp(String.raw`\b(?:owned and operated by|owned by|operated by|(?:founded|started|established)(?:\s+in\s+(?:19|20)\d{2})?\s+by)\s+${NAME}`, 'gi'),
];

// Owner, owned/operated by, President, CEO, proprietor → running it now. Founder, founded/started/established by → started it.
const CURRENT_ROLE = /\b(?:owners?|owned|operated by|proprietor|president|ceo)\b/i;

/** Role words around the name decide the role; "Founder & President" counts as the owner. */
export const roleFromMatch = (matchText: string, nameText: string): FoundName['role'] =>
  CURRENT_ROLE.test(matchText.replace(nameText, ' ')) ? 'owner' : 'founder';

export function findOwnerName(pages: PageDoc[]): FoundName | null {
  for (const page of pages) {
    const text = pageText(page);
    for (const re of OWNER_PATTERNS) {
      for (const m of text.matchAll(re)) {
        const name = personName(m[1]!);
        if (name) return { ...found(page, name, 'text', snippet(text, m.index, m[0].length)), role: roleFromMatch(m[0], m[1]!) };
      }
    }
  }
  return null;
}

// ---- phone & email -------------------------------------------------------------------------

const PHONE_TEXT = /(?:\+?1[\s.-]*)?\(?\b[2-9]\d{2}\)?[\s.-]*[2-9]\d{2}[\s.-]*\d{4}\b/g;

export function findPhone(pages: PageDoc[]): Found<string> | null {
  for (const page of pages) {
    const $ = cheerio.load(page.html);
    let hit: Found<string> | null = null;
    $('a[href^="tel:"], a[href^="TEL:"]').each((_, el) => {
      const href = $(el).attr('href') ?? '';
      const p = normalizePhone(decodeURIComponent(href.slice(4)));
      if (p && !hit) hit = found(page, p, 'tel: link', href.slice(0, 80));
    });
    if (hit) return hit;
  }
  for (const page of pages) {
    const text = pageText(page);
    for (const m of text.matchAll(PHONE_TEXT)) {
      const p = normalizePhone(m[0]);
      if (p) return found(page, p, 'text', snippet(text, m.index, m[0].length));
    }
  }
  return null;
}

const EMAIL_TEXT = /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/gi;
const JUNK_EMAIL = /\.(png|jpe?g|gif|webp|svg)$|@(?:example\.(?:com|org)|domain\.com|email\.com|yourdomain\.com|sentry\.io|[\w-]*\.?wixpress\.com|sentry-next\.wixpress\.com|godaddy\.com|wix\.com)$|^(?:no-?reply|donotreply)@/i;

/** Email from mailto: links, then text. Prefers an address on the company's own domain. */
export function findEmail(pages: PageDoc[], siteDomain: string | null): Found<string> | null {
  const candidates: Found<string>[] = [];
  for (const page of pages) {
    const $ = cheerio.load(page.html);
    $('a[href^="mailto:"], a[href^="MAILTO:"]').each((_, el) => {
      const href = $(el).attr('href') ?? '';
      const e = normalizeEmail(decodeURIComponent(href.slice(7).split('?')[0]!));
      if (e && !JUNK_EMAIL.test(e)) candidates.push(found(page, e, 'mailto: link', href.slice(0, 80)));
    });
  }
  for (const page of pages) {
    const text = pageText(page);
    for (const m of text.matchAll(EMAIL_TEXT)) {
      const e = normalizeEmail(m[0]);
      if (e && !JUNK_EMAIL.test(e)) candidates.push(found(page, e, 'text', snippet(text, m.index, m[0].length)));
    }
  }
  const own = siteDomain ? candidates.find((c) => c.value.endsWith(`@${siteDomain}`) || c.value.endsWith(`.${siteDomain}`)) : undefined;
  return own ?? candidates[0] ?? null;
}

// ---- ownership signals ---------------------------------------------------------------------

const FAMILY =
  /\bfamily[- ](?:owned|run|operated)\b|\bfamily business\b|\blocally[- ]owned\b|\bowner[- ]operated\b|\b(?:second|third|fourth|fifth|2nd|3rd|4th|5th)[- ]generation\b/i;
const FRANCHISE =
  /\bfranchise[sd]?\b|\bsubsidiary of\b|\bportfolio company\b|\bacquired by\b|\ba division of\b|\bpart of the [A-Z][\w&'’ -]{1,40} family of (?:companies|brands)\b/i;
// Franchise boilerplate, but small independents say it too: it only counts next to "franchise" or "location(s)".
const INDEPENDENTLY_OWNED = /\bindependently owned and operated\b/i;
const FRANCHISE_CONTEXT = /\bfranchis\w*|\blocations?\b/i;
const NEGATED = /\b(?:not|never|no|isn'?t|aren'?t|without)\s+(?:a\s+|an\s+|any\s+)?(?:\w+\s+)?$/i;
const NONPROFIT = /\bnon-?profit\b|\bnot-for-profit\b|\b501\s*\(\s*c\s*\)\s*\(?\s*3\s*\)?/i;

function firstMatch(pages: PageDoc[], re: RegExp, opts: { skipNegated?: boolean } = {}): Found<true> | null {
  const global = new RegExp(re.source, re.flags.includes('g') ? re.flags : `${re.flags}g`);
  for (const page of pages) {
    const text = pageText(page);
    for (const m of text.matchAll(global)) {
      if (opts.skipNegated && NEGATED.test(text.slice(Math.max(0, m.index - 30), m.index))) continue;
      return found(page, true as const, 'text', snippet(text, m.index, m[0].length));
    }
  }
  return null;
}

export const findFamilyOwned = (pages: PageDoc[]) => firstMatch(pages, FAMILY, { skipNegated: true });
export function findFranchise(pages: PageDoc[]): Found<true> | null {
  for (const page of pages) {
    const text = pageText(page);
    const indep = INDEPENDENTLY_OWNED.exec(text);
    if (indep) {
      const rest = text.slice(0, indep.index) + text.slice(indep.index + indep[0].length);
      if (FRANCHISE_CONTEXT.test(rest)) return found(page, true as const, 'text', snippet(text, indep.index, indep[0].length));
    }
    const strong = firstMatch([page], FRANCHISE, { skipNegated: true });
    if (strong) return strong;
  }
  return null;
}

export function findNonprofit(pages: PageDoc[], siteDomain: string | null): Found<true> | null {
  if (siteDomain && /\.(gov|edu)$/.test(siteDomain)) {
    return { value: true, source: 'website domain', method: 'meta', evidence: siteDomain };
  }
  return firstMatch(pages, NONPROFIT, { skipNegated: true });
}

// ---- digital maturity ----------------------------------------------------------------------

// "© 2019", "Copyright © 2012–2024", "© Air-Stream 2020"
const COPYRIGHT_YEAR = /(?:©|\(c\)|copyright)[^\d\n]{0,30}?(?:(?:19|20)\d{2}\s*[-–—]\s*)?((?:19|20)\d{2})\b/gi;

/** Latest © year across pages (site builders often auto-update this, so it's only a hint). */
export function findCopyrightYear(pages: PageDoc[], now: Date): Found<number> | null {
  let best: Found<number> | null = null;
  for (const page of pages) {
    const text = pageText(page);
    for (const m of text.matchAll(COPYRIGHT_YEAR)) {
      const year = Number(m[1]);
      if (validYear(year, now) && (!best || year > best.value)) best = found(page, year, 'text', snippet(text, m.index, m[0].length));
    }
  }
  return best;
}

export const hasViewport = (page: PageDoc | undefined) =>
  page ? cheerio.load(page.html)('meta[name="viewport" i]').length > 0 : false;
