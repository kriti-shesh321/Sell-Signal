import * as cheerio from 'cheerio';
import { phone as normalizePhone, email as normalizeEmail, state as normalizeState } from '../../pipeline/normalize.js';
import { emptyStructured, type StructuredFacts } from './jsonld.js';
import type { Found, PageDoc } from './types.js';
import { personName, validYear } from './util.js';

/** Facts from schema.org microdata (itemprop attributes). */
export function fromMicrodata(page: PageDoc, now: Date): StructuredFacts {
  const $ = cheerio.load(page.html);
  const facts = emptyStructured();
  const prop = (name: string): string | null => {
    const el = $(`[itemprop="${name}"]`).first();
    if (!el.length) return null;
    const v = el.attr('content') ?? el.attr('datetime') ?? el.find('[itemprop="name"]').first().text() ?? '';
    const text = (v || el.text()).replace(/\s+/g, ' ').trim();
    return text || null;
  };
  const found = <T>(value: T, evidence: string): Found<T> => ({ value, source: page.source, method: 'microdata', evidence });

  const fd = prop('foundingDate');
  const year = fd ? Number(/\b(1[89]\d{2}|20\d{2})\b/.exec(fd)?.[1]) : NaN;
  if (validYear(year, now)) facts.yearFounded = found(year, `foundingDate: "${fd}"`);

  const founder = prop('founder');
  const name = founder ? personName(founder) : null;
  if (name) facts.ownerName = found(name, `founder: "${name}"`);

  const tel = normalizePhone(prop('telephone'));
  if (tel) facts.phone = found(tel, `telephone: "${prop('telephone')}"`);

  const e = normalizeEmail(prop('email'));
  if (e) facts.email = found(e, `email: "${e}"`);

  const street = prop('streetAddress');
  const city = prop('addressLocality');
  if (street || city) {
    const region = prop('addressRegion');
    const addr = { street, city, state: normalizeState(region) ?? region, postalCode: prop('postalCode') };
    facts.address = found(addr, [street, city, addr.state].filter(Boolean).join(', ').slice(0, 80));
  }
  return facts;
}
