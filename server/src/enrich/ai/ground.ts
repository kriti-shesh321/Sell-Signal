import { roleFromMatch } from '../extract/text.js';
import type { Found, FoundName } from '../extract/types.js';
import { personName, snippet, validYear } from '../extract/util.js';
import type { AiAnswer, PageText } from './prompt.js';

/** Bump when the prompt or guard changes, so cached AI answers are asked again (rules facts stay cached). */
export const AI_VERSION = 2;

/** AI-suggested facts that passed the grounding guard. Cached per domain as domain_cache.data.ai. */
export interface AiFacts {
  version: number;
  model: string;
  ownerName: FoundName | null;
  yearFounded: Found<number> | null;
  familyOwned: Found<true> | null;
  /** Suggestions thrown out by the guard, e.g. "ownerName: quote not on the page". */
  rejected: string[];
}

const norm = (s: string) =>
  s
    .normalize('NFKC')
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[–—]/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();

// A founder only when the quote says they started it; "the founders' daughter … purchased the company" is an owner.
const FOUNDING = /\b(?:founded|founding|founder|co-founder|started|established|opened)\b/i;
const CURRENT = /\b(?:owners?|owned|operated by|proprietor|president|ceo|purchased|bought|took over|acquired)\b/i;

/** Role checked against the quote: the model's word counts only when the quote backs it up. */
function roleFor(answer: AiAnswer, name: string): FoundName['role'] {
  const rest = answer.ownerQuote!.replace(name, ' ');
  if (answer.ownerRole === 'founder' && FOUNDING.test(rest)) return 'founder';
  if (answer.ownerRole === 'owner' || CURRENT.test(rest)) return 'owner';
  return roleFromMatch(answer.ownerQuote!, name);
}

const COPYRIGHT = /©|&copy;|copyright|all rights reserved/i;
// Wider than the rules' phrase list, but the quote must still be on the page and talk about family.
const FAMILY_WORDS =
  /\bfamily\b|\bgenerations?\b|\bfather\b|\bmother\b|\bsons?\b|\bdaughters?\b|\bbrothers?\b|\bsisters?\b|\bhusband\b|\bwife\b|\bowner[- ]operated\b|\blocally[- ]owned\b/i;
const FRANCHISE_WORDS = /\bfranchis\w*|\bsubsidiary\b|\bportfolio\b|\bacquired by\b/i;

/** The page whose text contains the quote verbatim (ignoring case, spacing and curly quotes). */
export function pageWithQuote(pages: PageText[], quote: string | null): PageText | null {
  if (!quote) return null;
  const q = norm(quote);
  if (q.length < 8) return null;
  return pages.find((p) => norm(p.text).includes(q)) ?? null;
}

/** ≤ 80-char evidence centred on the value inside the quote. */
const evidence = (quote: string, value: string) => {
  const flat = quote.replace(/\s+/g, ' ').trim();
  const i = flat.toLowerCase().indexOf(value.toLowerCase());
  return snippet(flat, Math.max(0, i), i >= 0 ? value.length : 0);
};

/**
 * Anti-hallucination guard. A suggestion is kept only if its quote appears verbatim on a fetched page
 * and the value appears in that quote: an owner must be a plausible person name, a year must pass
 * 1900…current year and not come from a © line, and family-owned must be said in family words.
 */
export function groundAnswer(answer: AiAnswer, pages: PageText[], opts: { model: string; now?: Date }): AiFacts {
  const now = opts.now ?? new Date();
  const source = (page: PageText) => `AI (${opts.model}) from ${page.source}`;
  const out: AiFacts = { version: AI_VERSION, model: opts.model, ownerName: null, yearFounded: null, familyOwned: null, rejected: [] };
  const reject = (field: string, why: string) => out.rejected.push(`${field}: ${why}`);

  if (answer.ownerName) {
    const page = pageWithQuote(pages, answer.ownerQuote);
    const name = personName(answer.ownerName.trim());
    if (!page) reject('ownerName', 'quote not on the page');
    else if (!name) reject('ownerName', `"${answer.ownerName}" is not a person name`);
    else if (!norm(answer.ownerQuote!).includes(norm(name))) reject('ownerName', 'name not in the quote');
    else out.ownerName = { value: name, source: source(page), method: 'AI', evidence: evidence(answer.ownerQuote!, name), role: roleFor(answer, name) };
  }

  if (answer.foundedYear !== null) {
    const year = answer.foundedYear;
    const page = pageWithQuote(pages, answer.foundedQuote);
    if (!page) reject('yearFounded', 'quote not on the page');
    else if (!validYear(year, now)) reject('yearFounded', `${year} is outside 1900…${now.getFullYear()}`);
    else if (!new RegExp(`\\b${year}\\b`).test(answer.foundedQuote!)) reject('yearFounded', 'year not in the quote');
    else if (COPYRIGHT.test(answer.foundedQuote!)) reject('yearFounded', 'year comes from a copyright line');
    else out.yearFounded = { value: year, source: source(page), method: 'AI', evidence: evidence(answer.foundedQuote!, String(year)) };
  }

  if (answer.familyOwned === true) {
    const page = pageWithQuote(pages, answer.familyQuote);
    const match = answer.familyQuote?.match(FAMILY_WORDS);
    if (!page) reject('familyOwned', 'quote not on the page');
    else if (!match) reject('familyOwned', 'quote does not mention family');
    else if (FRANCHISE_WORDS.test(answer.familyQuote!)) reject('familyOwned', 'quote is about a franchise');
    else out.familyOwned = { value: true, source: source(page), method: 'AI', evidence: evidence(answer.familyQuote!, match[0]) };
  }

  return out;
}
