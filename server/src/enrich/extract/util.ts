import * as cheerio from 'cheerio';

const BLOCK_TAGS = 'p,div,li,ul,ol,h1,h2,h3,h4,h5,h6,td,th,tr,section,article,header,footer,nav,aside,address,blockquote,dd,dt,figcaption,main,form,label,option';
const INLINE_TAGS = 'a,span,strong,em,b,i,small,button';

/** Visible text with line breaks between blocks, so "<p>Since</p><p>1985</p>" doesn't become "Since1985". */
export function visibleText(html: string): string {
  const $ = cheerio.load(html);
  $('script,style,noscript,template,svg,iframe,head').remove();
  $('br').replaceWith('\n');
  $(BLOCK_TAGS).append('\n');
  $(INLINE_TAGS).append(' ');
  return $.root()
    .text()
    .replace(/ /g, ' ')
    .replace(/[ \t\f\v]+/g, ' ')
    .replace(/ *\n[\n ]*/g, '\n')
    .trim();
}

/** ≤ 80-char single-line quote around a match. */
export function snippet(text: string, index: number, length: number, max = 80): string {
  const pad = Math.max(0, Math.floor((max - length) / 2));
  const start = Math.max(0, index - pad);
  const end = Math.min(text.length, index + length + pad);
  let s = text.slice(start, end).replace(/\s+/g, ' ').trim();
  if (s.length > max) s = s.slice(0, max).trim();
  return `${start > 0 ? '…' : ''}${s}${end < text.length ? '…' : ''}`;
}

export const currentYear = (now: Date) => now.getFullYear();

export const validYear = (y: number, now: Date) => Number.isInteger(y) && y >= 1900 && y <= currentYear(now);

// Capitalized words that look like name parts on business sites but aren't people.
const NOT_NAME = new Set(
  (
    'our the your we us you and or of for to at in on by with a an is are was owner owners operator operated owned family local locally ' +
    'business company companies services service plumbing plumber plumbers heating air conditioning cooling refrigeration electric electrical ' +
    'electrician electricians roofing roofer hvac repair repairs installation install contractor contractors texas dallas houston austin ' +
    'san antonio contact call today free estimate estimates about home team customer customers residential commercial license licensed ' +
    'master certified insured bonded inc llc co corp ltd lp group enterprises solutions systems energy ac heat cool mechanical ' +
    'president ceo founder cofounder co-founder proprietor manager general vice director principal partner partners staff office ' +
    'meet welcome hello since established est quality best trusted professional professionals experts expert new more read learn ' +
    'privacy policy terms rights reserved copyright all site map google facebook reviews review page click here st street ave avenue ' +
    'holdings capital industries international associates brothers bros partners holding ventures investments ' +
    'rd road dr drive suite tx usa us america american national county city north south east west central greater metro area'
  ).split(/\s+/),
);

// Titles and filler that may precede a name ("Owner and Master Plumber Tom Baker", "the late John Smith").
const LEADING_SKIP = new Set(
  'our the meet and mr mrs ms dr late master licensed certified plumber electrician owner founder cofounder co-founder president ceo operator proprietor'.split(' '),
);

const NAME_TOKEN = /^[A-Z][a-z]+(?:[-'’][A-Z]?[a-z]+)?$|^[A-Z]\.$|^(?:Mc|Mac|O')[A-Z][a-z]+$/;

/**
 * Clean a candidate person name: drop leading titles ("Plumber John Smith" → "John Smith"),
 * stop at the first non-name word, and require 2–3 name tokens with a real first and last name.
 */
const COMPANY_SUFFIX = /^(?:llc|inc|corp|corporation|co|company|ltd|lp|llp|pllc|holdings|group|enterprises)\.?$/i;

export function personName(candidate: string): string | null {
  const tokens = candidate
    .replace(/[,;:()]/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .map((t) => (/^[A-Z]\.$/.test(t) ? t : t.replace(/[.]+$/, ''))); // "Saliba." → "Saliba", keep initials like "F."
  if (tokens.some((t) => COMPANY_SUFFIX.test(t))) return null; // "Acme Holdings LLC" is a company
  let i = 0;
  // Skip lowercase words and known titles; any other capitalized non-name word means this isn't a name.
  while (i < tokens.length && (LEADING_SKIP.has(tokens[i]!.toLowerCase()) || !/^[A-Z]/.test(tokens[i]!))) i++;
  const name: string[] = [];
  for (; i < tokens.length && name.length < 3; i++) {
    const t = tokens[i]!;
    if (NOT_NAME.has(t.toLowerCase().replace(/\.$/, '')) || !NAME_TOKEN.test(t)) break;
    name.push(t);
  }
  while (name.length && /^[A-Z]\.$/.test(name[name.length - 1]!)) name.pop(); // no trailing initial
  if (name.length < 2 || /^[A-Z]\.$/.test(name[0]!)) return null;
  return name.join(' ');
}
