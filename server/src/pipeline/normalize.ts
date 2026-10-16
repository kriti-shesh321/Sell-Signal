import { classifyIndustry } from '../sources/trades.js';
import { toStateCode } from '../sources/states.js';
import type { NormalizedLead, RawLead } from '../types.js';

const MISSING = new Set(['n/a', 'na', 'n.a.', '#n/a', 'nan', 'null', 'none', 'undefined', '-', '--']);

/** Trimmed string, or null for empty and "missing" markers (N/A, NaN, null, -, ...). */
export function clean(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : null;
  if (typeof value !== 'string') return null;
  const s = value.replace(/\s+/g, ' ').trim();
  if (!s || MISSING.has(s.toLowerCase())) return null;
  return s;
}

// Website builders where the subdomain, not the root, identifies the business.
const PLATFORM_HOSTS = [
  'wixsite.com', 'square.site', 'business.site', 'godaddysites.com', 'weebly.com', 'wordpress.com',
  'blogspot.com', 'myshopify.com', 'squarespace.com', 'webflow.io', 'netlify.app', 'vercel.app',
  'github.io', 'carrd.co', 'site123.me', 'jimdosite.com', 'mystrikingly.com', 'webs.com',
];
// Profiles and directories: never a company's own domain.
const NOT_COMPANY_DOMAINS = new Set([
  'facebook.com', 'fb.com', 'instagram.com', 'linkedin.com', 'twitter.com', 'x.com', 'youtube.com',
  'tiktok.com', 'pinterest.com', 'yelp.com', 'google.com', 'goo.gl', 'g.page', 'bbb.org',
  'yellowpages.com', 'nextdoor.com', 'angi.com', 'homeadvisor.com', 'thumbtack.com', 'houzz.com',
  'mapquest.com', 'apple.com',
]);
// Second-level labels used under country TLDs (example.co.uk → keep three labels).
const COUNTRY_SLDS = new Set(['co', 'com', 'net', 'org', 'gov', 'edu', 'ac']);

/** Any URL-ish input → root domain ("https://www.Foo.com/location/x?y" → "foo.com"), or null. */
export function domain(value: unknown): string | null {
  const v = clean(value);
  if (!v || /\s/.test(v)) return null;
  let s = v.toLowerCase();
  if (s.includes('@') && !s.includes('/')) return null; // an email address, not a website
  if (!/^[a-z][a-z0-9+.-]*:\/\//.test(s)) s = `http://${s}`;
  let host: string;
  try {
    host = new URL(s).hostname;
  } catch {
    return null;
  }
  host = host.replace(/\.$/, '').replace(/^www\d*\./, '');
  if (!host.includes('.') || /^\d{1,3}(\.\d{1,3}){3}$/.test(host)) return null;

  for (const platform of PLATFORM_HOSTS) {
    if (host === platform) return null;
    if (host.endsWith(`.${platform}`)) {
      const sub = host.slice(0, -platform.length - 1).split('.').pop();
      return `${sub}.${platform}`;
    }
  }

  const labels = host.split('.');
  const tld = labels[labels.length - 1]!;
  const sld = labels[labels.length - 2]!;
  const keep = labels.length > 2 && tld.length === 2 && COUNTRY_SLDS.has(sld) ? 3 : 2;
  const root = labels.slice(-keep).join('.');
  return NOT_COMPANY_DOMAINS.has(root) ? null : root;
}

/** US phone → 10 digits ("+1 (214) 555-0101 x12" → "2145550101"), or null. Uses the first of several numbers. */
export function phone(value: unknown): string | null {
  const v = clean(value);
  if (!v) return null;
  const first = v.split(/;|\/|,(?=\s*\+?\(?\d)/)[0]!;
  const withoutExt = first.replace(/\s*(?:x|ext\.?|extension|#)\s*\d+\s*$/i, '');
  let digits = withoutExt.replace(/\D/g, '');
  if (digits.length === 11 && digits.startsWith('1')) digits = digits.slice(1);
  return digits.length === 10 ? digits : null;
}

const NAME_SUFFIXES = new Set([
  'llc', 'inc', 'incorporated', 'co', 'corp', 'corporation', 'company', 'ltd', 'limited', 'lp', 'llp', 'pllc', 'pc',
]);

/** Company name reduced for matching: "Smith Plumbing, LLC." → "smith plumbing". */
export function nameKey(value: unknown): string | null {
  const v = clean(value);
  if (!v) return null;
  const tokens = v
    .toLowerCase()
    .replace(/\b((?:[a-z]\.){2,})/g, (m) => m.replace(/\./g, '')) // L.L.C. → llc, L.P. → lp
    .replace(/&/g, ' and ')
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .split(' ')
    .filter(Boolean);
  const stripped = tokens.filter((t) => !NAME_SUFFIXES.has(t));
  const key = (stripped.length ? stripped : tokens).join(' ');
  return key || null;
}

/** "Texas" / "tx" → "TX", or null. */
export function state(value: unknown): string | null {
  const v = clean(value);
  return v ? toStateCode(v) : null;
}

/** Lowercased email without "mailto:", or null if it doesn't look like an address. */
export function email(value: unknown): string | null {
  const v = clean(value);
  if (!v) return null;
  const first = v.replace(/^mailto:/i, '').split(/[;,\s]/)[0]!.toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/.test(first) ? first : null;
}

/** First 4-digit year in the value, accepted only if 1900 ≤ year ≤ current year. */
export function foundingYear(value: unknown, now: Date = new Date()): number | null {
  const v = clean(value);
  if (!v) return null;
  const m = v.match(/\b(1[89]\d{2}|20\d{2})\b/);
  if (!m) return null;
  const year = Number(m[1]);
  return year >= 1900 && year <= now.getFullYear() ? year : null;
}

export function normalizeLead(lead: RawLead, now: Date = new Date()): NormalizedLead {
  const d = domain(lead.website);
  return {
    source: lead.source,
    raw: lead.raw,
    company: clean(lead.company),
    domain: d,
    website: d ? `https://${d}/` : null,
    phone: phone(lead.phone),
    email: email(lead.email),
    street: clean(lead.street),
    city: clean(lead.city),
    state: state(lead.state),
    industry: classifyIndustry(clean(lead.industry)),
    yearFounded: foundingYear(lead.yearFounded, now),
    ownerName: clean(lead.ownerName),
    nameKey: nameKey(lead.company),
  };
}
