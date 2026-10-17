import { domain as rootDomain } from '../../pipeline/normalize.js';
import type { FetchedPage } from '../crawl.js';
import { fromJsonLd, type StructuredFacts } from './jsonld.js';
import { fromMicrodata } from './microdata.js';
import {
  findCopyrightYear,
  findEmail,
  findFamilyOwned,
  findFranchise,
  findNonprofit,
  findOwnerName,
  findPhone,
  findYearFounded,
  hasViewport,
} from './text.js';
import type { PageDoc, SiteFacts } from './types.js';

export type { Found, SiteFacts, SiteSignals, PostalAddress } from './types.js';

/** Bump whenever extraction rules change, so cached facts from older rules are re-crawled. */
export const EXTRACTOR_VERSION = 2;

const toDocs = (pages: FetchedPage[]): PageDoc[] =>
  pages.map((p) => ({ role: p.role, source: `website:${p.path}`, html: p.html }));

const byRole = (docs: PageDoc[], order: PageDoc['role'][]) =>
  [...docs].sort((a, b) => order.indexOf(a.role) - order.indexOf(b.role));

/**
 * Layered extraction per field: JSON-LD → microdata → text rules, first hit wins.
 * Every value carries the page, method and a short evidence quote.
 */
export function extractSite(pages: FetchedPage[], finalUrl: string, now: Date = new Date()): SiteFacts {
  const docs = toDocs(pages);
  const siteDomain = rootDomain(finalUrl);
  // About pages say the most about history and ownership; the homepage header carries the main phone.
  const historyFirst = byRole(docs, ['about', 'home', 'contact']);
  const contactFirst = byRole(docs, ['home', 'contact', 'about']);

  const structured: StructuredFacts[] = [
    ...historyFirst.map((d) => fromJsonLd(d, now)),
    ...historyFirst.map((d) => fromMicrodata(d, now)),
  ];
  const pick = <K extends keyof StructuredFacts>(key: K) => structured.find((s) => s[key])?.[key] ?? null;

  return {
    yearFounded: pick('yearFounded') ?? findYearFounded(historyFirst, now),
    ownerName: pick('ownerName') ?? findOwnerName(historyFirst),
    phone: pick('phone') ?? findPhone(contactFirst),
    email: pick('email') ?? findEmail(contactFirst, siteDomain),
    address: pick('address'),
    signals: {
      familyOwned: findFamilyOwned(historyFirst),
      franchise: findFranchise(historyFirst),
      nonprofit: findNonprofit(historyFirst, siteDomain),
      copyrightYear: findCopyrightYear(docs, now),
      hasViewport: hasViewport(docs.find((d) => d.role === 'home')),
      https: finalUrl.startsWith('https:'),
    },
  };
}
