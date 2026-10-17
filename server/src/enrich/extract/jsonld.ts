import * as cheerio from 'cheerio';
import { phone as normalizePhone, email as normalizeEmail, state as normalizeState } from '../../pipeline/normalize.js';
import type { Found, PageDoc, PostalAddress } from './types.js';
import { personName, validYear } from './util.js';

type Node = Record<string, unknown>;

export interface StructuredFacts {
  yearFounded: Found<number> | null;
  ownerName: Found<string> | null;
  phone: Found<string> | null;
  email: Found<string> | null;
  address: Found<PostalAddress> | null;
}

export const emptyStructured = (): StructuredFacts => ({
  yearFounded: null,
  ownerName: null,
  phone: null,
  email: null,
  address: null,
});

function parseLenient(text: string): unknown {
  const t = text.trim().replace(/^<!--|-->$/g, '');
  try {
    return JSON.parse(t);
  } catch {
    try {
      // common breakage: trailing commas and raw newlines inside strings
      return JSON.parse(t.replace(/,\s*([}\]])/g, '$1').replace(/[\u0000-\u001f]+/g, ' '));
    } catch {
      return null;
    }
  }
}

/** All objects in the page's JSON-LD blocks, flattening arrays, @graph and nested values. */
export function jsonLdNodes(html: string): Node[] {
  const $ = cheerio.load(html);
  const out: Node[] = [];
  const visit = (v: unknown, depth: number) => {
    if (depth > 6 || v === null || typeof v !== 'object') return;
    if (Array.isArray(v)) return v.forEach((x) => visit(x, depth + 1));
    const node = v as Node;
    out.push(node);
    for (const value of Object.values(node)) if (typeof value === 'object') visit(value, depth + 1);
  };
  $('script[type="application/ld+json"]').each((_, el) => visit(parseLenient($(el).text()), 0));
  return out;
}

const types = (n: Node): string[] => {
  const t = n['@type'];
  return (Array.isArray(t) ? t : [t]).filter((x): x is string => typeof x === 'string');
};

const ORG_TYPE = /Organization|Business|Corporation|Contractor|Plumber|Electrician|HVAC|Roofing|Service|Store|Company|Place/i;
const isOrg = (n: Node) => types(n).some((t) => ORG_TYPE.test(t));
const str = (v: unknown): string | null => (typeof v === 'string' ? v.trim() || null : typeof v === 'number' ? String(v) : null);

function founderName(v: unknown): string | null {
  for (const f of Array.isArray(v) ? v : [v]) {
    if (f && typeof f === 'object' && types(f as Node).some((t) => t !== 'Person')) continue; // founder can be an Organization
    const raw = typeof f === 'string' ? f : f && typeof f === 'object' ? str((f as Node).name) : null;
    const name = raw ? personName(raw) : null;
    if (name) return name;
  }
  return null;
}

function postalAddress(v: unknown): PostalAddress | null {
  const a = (Array.isArray(v) ? v[0] : v) as Node | string | undefined;
  if (!a || typeof a !== 'object') return null;
  const addr = {
    street: str(a.streetAddress),
    city: str(a.addressLocality),
    state: normalizeState(a.addressRegion) ?? str(a.addressRegion),
    postalCode: str(a.postalCode),
  };
  return addr.street || addr.city ? addr : null;
}

/** Facts from schema.org JSON-LD: foundingDate, founder, telephone, email, address. Organizations first. */
export function fromJsonLd(page: PageDoc, now: Date): StructuredFacts {
  const facts = emptyStructured();
  const nodes = jsonLdNodes(page.html);
  const ordered = [...nodes.filter(isOrg), ...nodes.filter((n) => !isOrg(n))];
  const found = <T>(value: T, evidence: string): Found<T> => ({ value, source: page.source, method: 'JSON-LD', evidence });

  for (const n of ordered) {
    if (!facts.yearFounded) {
      const fd = str(n.foundingDate);
      const year = fd ? Number(/\b(1[89]\d{2}|20\d{2})\b/.exec(fd)?.[1]) : NaN;
      if (validYear(year, now)) facts.yearFounded = found(year, `foundingDate: "${fd}"`);
    }
    if (!facts.ownerName && n.founder !== undefined) {
      const name = founderName(n.founder);
      if (name) facts.ownerName = found(name, `founder: "${name}"`);
    }
    if (!facts.phone) {
      const tel = normalizePhone(str(n.telephone));
      if (tel) facts.phone = found(tel, `telephone: "${str(n.telephone)}"`);
    }
    if (!facts.email) {
      const e = normalizeEmail(str(n.email));
      if (e) facts.email = found(e, `email: "${e}"`);
    }
    if (!facts.address && n.address !== undefined && isOrg(n)) {
      const addr = postalAddress(n.address);
      if (addr) facts.address = found(addr, [addr.street, addr.city, addr.state].filter(Boolean).join(', ').slice(0, 80));
    }
  }
  return facts;
}
