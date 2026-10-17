import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { FetchedPage } from '../../src/enrich/crawl.js';
import { extractSite } from '../../src/enrich/extract/index.js';
import { fromJsonLd, jsonLdNodes } from '../../src/enrich/extract/jsonld.js';
import { fromMicrodata } from '../../src/enrich/extract/microdata.js';
import {
  findCopyrightYear,
  findEmail,
  findFamilyOwned,
  findFranchise,
  findNonprofit,
  findOwnerName,
  findYearFounded,
  hasViewport,
} from '../../src/enrich/extract/text.js';
import type { PageDoc } from '../../src/enrich/extract/types.js';
import { personName, visibleText } from '../../src/enrich/extract/util.js';

const NOW = new Date('2026-06-01T00:00:00Z');
const fixture = (name: string) => readFileSync(new URL(`../fixtures/html/${name}`, import.meta.url), 'utf8');
const doc = (name: string, role: PageDoc['role'] = 'about', path = '/about/'): PageDoc => ({
  role,
  source: `website:${path}`,
  html: fixture(name),
});
const page = (name: string, role: FetchedPage['role'], path: string): FetchedPage => ({
  role,
  url: `https://example.test${path}`,
  path,
  html: fixture(name),
});

describe('real pages (trimmed fixtures)', () => {
  it('George Plumbing /about/: established 1947 by its founder', () => {
    const f = extractSite([page('real-yell4george-about.html', 'about', '/about/')], 'https://yell4george.com/', NOW);
    expect(f.yearFounded).toMatchObject({ value: 1947, method: 'text', source: 'website:/about/' });
    expect(f.yearFounded?.evidence).toMatch(/Established in 1947/);
    expect(f.ownerName).toMatchObject({ value: 'George F. Saliba', method: 'text', role: 'founder' });
    expect(f.phone).toMatchObject({ value: '7262223200', method: 'JSON-LD' });
    expect(f.address?.value).toMatchObject({ street: '12 Burwood Ln', city: 'San Antonio', state: 'TX', postalCode: '78216' });
    expect(f.signals.familyOwned).toBeNull(); // "Family: More than a workplace…" is a value statement, not ownership
  });

  it('Bellomy /about-us: founder in text, address in JSON-LD, © range takes the latest year', () => {
    const f = extractSite([page('real-bellomyims-about.html', 'about', '/about-us')], 'https://www.bellomyims.com/', NOW);
    expect(f.ownerName).toMatchObject({ value: 'Randy Bellomy', method: 'text', role: 'founder' });
    expect(f.ownerName?.evidence).toMatch(/founder Randy Bellomy/);
    expect(f.yearFounded).toMatchObject({ value: 1980 });
    expect(f.phone).toMatchObject({ value: '2144672653', method: 'JSON-LD' });
    expect(f.address?.value.city).toBe('Grapevine');
    expect(f.signals.copyrightYear?.value).toBe(2026);
  });

  it('Elite Austin AC /about-us/: JSON-LD founder + foundingDate beat text', () => {
    const f = extractSite([page('real-eliteaustinac-about.html', 'about', '/about-us/')], 'https://eliteaustinac.com/', NOW);
    expect(f.yearFounded).toMatchObject({ value: 2013, method: 'JSON-LD', evidence: 'foundingDate: "2013-12-04"' });
    expect(f.ownerName).toMatchObject({ value: 'Kyle Bacon', method: 'JSON-LD', role: 'founder' });
    expect(f.signals.familyOwned?.evidence).toMatch(/Locally owned/i);
    expect(f.address?.value).toMatchObject({ street: '7101 Burleson Road', city: 'Austin' });
  });

  it('JD Precision home + about: earliest year across pages, owner from about, family-owned', () => {
    const f = extractSite(
      [page('real-jdprecision-home.html', 'home', '/'), page('real-jdprecision-about.html', 'about', '/about-us/')],
      'https://www.jdprecisionplumbing.com/',
      NOW,
    );
    expect(f.yearFounded?.value).toBe(2010);
    expect(f.ownerName).toMatchObject({ value: 'Jerry David', source: 'website:/about-us/', role: 'owner' });
    expect(f.signals.familyOwned?.evidence).toMatch(/family-owned and operated/);
    expect(f.signals.franchise).toBeNull(); // "Joining the JD Precision Family" is an acquisition they made
    expect(f.signals.copyrightYear?.value).toBe(2026);
    expect(f.signals).toMatchObject({ hasViewport: true, https: true });
    expect(f.phone?.value).toBe('9362285000');
  });

  it('JD Precision about: "Founded in Conroe, TX in 2010"', () => {
    const y = findYearFounded([doc('real-jdprecision-about.html')], NOW);
    expect(y?.value).toBe(2010);
  });

  it('Air-Stream: uppercase SINCE, family owned, "© Air-Stream 2020", tel link', () => {
    const f = extractSite([page('real-airstream-about.html', 'about', '/About-air-stream.html')], 'https://www.air-streamservices.com/', NOW);
    expect(f.yearFounded?.value).toBe(1974);
    expect(f.signals.familyOwned).not.toBeNull();
    expect(f.signals.copyrightYear?.value).toBe(2020);
    expect(f.phone).toMatchObject({ value: '8002238017', method: 'tel: link' });
  });
});

describe('microdata layer', () => {
  it('reads foundingDate, founder, telephone, email and address', () => {
    const f = fromMicrodata(doc('edge-microdata.html', 'home', '/'), NOW);
    expect(f.yearFounded).toMatchObject({ value: 1979, method: 'microdata' });
    expect(f.ownerName).toMatchObject({ value: 'Maria Gonzalez', role: 'founder' });
    expect(f.phone?.value).toBe('8175550199');
    expect(f.email?.value).toBe('office@lonestarroofing.test');
    expect(f.address?.value).toMatchObject({ street: '400 Main St', city: 'Fort Worth', state: 'TX', postalCode: '76102' });
  });

  it('is used when there is no JSON-LD', () => {
    const f = extractSite([page('edge-microdata.html', 'home', '/')], 'https://lonestarroofing.test/', NOW);
    expect(f.yearFounded?.method).toBe('microdata');
    expect(f.signals.copyrightYear?.value).toBe(2018);
  });
});

describe('JSON-LD layer', () => {
  it('tolerates trailing commas', () => {
    const f = fromJsonLd(doc('edge-franchise.html'), NOW);
    expect(f.yearFounded?.value).toBe(2004);
    expect(f.phone?.value).toBe('9725550142');
  });

  it('flattens @graph and ignores unparsable blocks', () => {
    const html = '<script type="application/ld+json">{bad json</script><script type="application/ld+json">{"@graph":[{"@type":"Plumber","foundingDate":"1990"}]}</script>';
    expect(jsonLdNodes(html).some((n) => n.foundingDate === '1990')).toBe(true);
  });

  it('rejects a founder that is a company, not a person', () => {
    const html = '<script type="application/ld+json">{"@type":"Organization","founder":{"@type":"Organization","name":"Acme Holdings LLC"}}</script>';
    expect(fromJsonLd({ role: 'home', source: 'website:/', html }, NOW).ownerName).toBeNull();
  });

  it('rejects a foundingDate outside 1900..current year', () => {
    const html = '<script type="application/ld+json">{"@type":"Organization","foundingDate":"2099"}</script>';
    expect(fromJsonLd({ role: 'home', source: 'website:/', html }, NOW).yearFounded).toBeNull();
  });

  it('JSON-LD beats text when both exist', () => {
    const html =
      '<script type="application/ld+json">{"@type":"Plumber","foundingDate":"1988"}</script><p>Serving Dallas since 1985</p>';
    const f = extractSite([{ role: 'home', url: 'https://x.test/', path: '/', html }], 'https://x.test/', NOW);
    expect(f.yearFounded).toMatchObject({ value: 1988, method: 'JSON-LD' });
  });
});

describe('text rules: misfires', () => {
  const misfires = [doc('edge-misfires.html', 'home', '/')];

  it('earliest valid year wins; out-of-range and © years are ignored', () => {
    expect(findYearFounded(misfires, NOW)).toMatchObject({ value: 1985 });
  });

  it('accepts the current year but not the next', () => {
    const d = (t: string): PageDoc[] => [{ role: 'home', source: 'website:/', html: `<p>${t}</p>` }];
    expect(findYearFounded(d('Since 2026'), NOW)?.value).toBe(2026);
    expect(findYearFounded(d('Since 2027'), NOW)).toBeNull();
    expect(findYearFounded(d('Since 1899'), NOW)).toBeNull();
    expect(findYearFounded(d('Since 1900'), NOW)?.value).toBe(1900);
  });

  it('a lone "since 2020" is still accepted (known limitation: no earlier year to prefer)', () => {
    const d: PageDoc[] = [{ role: 'home', source: 'website:/', html: "<p>Since 2020 we've expanded.</p>" }];
    expect(findYearFounded(d, NOW)?.value).toBe(2020);
  });

  it('does not invent owners from capitalized marketing words', () => {
    expect(findOwnerName(misfires)).toBeNull();
  });

  it('negated franchise mention is not a franchise', () => {
    expect(findFranchise(misfires)).toBeNull();
  });

  it('copyright: the latest year of a range, ignoring "since" in the footer', () => {
    expect(findCopyrightYear(misfires, NOW)?.value).toBe(2019);
  });

  it('no viewport meta', () => {
    expect(hasViewport(misfires[0])).toBe(false);
  });
});

describe('text rules: owner patterns', () => {
  const owner = (t: string) => findOwnerName([{ role: 'about', source: 'website:/about/', html: `<p>${t}</p>` }])?.value ?? null;
  it.each([
    ['Owner: John Smith', 'John Smith'],
    ['Meet our owner, Jane Doe-Ramirez', 'Jane Doe-Ramirez'],
    ['John Smith, Owner', 'John Smith'],
    ['Mike Clements – President', 'Mike Clements'],
    ['The company was founded by Robert McNamara in 1982.', 'Robert McNamara'],
    ['Owned and operated by Daniel Hernandez.', 'Daniel Hernandez'],
    ['Owner and Master Plumber Tom Baker', 'Tom Baker'],
    ['Founder & President, Lisa Chen', 'Lisa Chen'],
  ])('%s → %s', (text, expected) => {
    expect(owner(text)).toBe(expected);
  });

  it.each(['Owner Operated', 'Call the Owner Today', 'founded by two brothers', 'Our President Plumbing Team', 'Owner: Smith Plumbing LLC'])(
    'rejects %s',
    (text) => {
      expect(owner(text)).toBeNull();
    },
  );

  const role = (t: string) => findOwnerName([{ role: 'about', source: 'website:/about/', html: `<p>${t}</p>` }])?.role ?? null;
  it.each([
    ['Owner: John Smith', 'owner'],
    ['John Smith, Owner', 'owner'],
    ['Owned and operated by Daniel Hernandez.', 'owner'],
    ['Mike Clements – President', 'owner'],
    ['CEO Dana White leads the team', 'owner'],
    ['Founder & President, Lisa Chen', 'owner'],
    ['Founder: Maria Lopez', 'founder'],
    ['Kyle Bacon — Co-Founder & Managing Member', 'founder'],
    ['The company was founded by Robert McNamara in 1982.', 'founder'],
    ['Started by Ann Lee in her garage', 'founder'],
    ['established in 1947 by George F. Saliba.', 'founder'],
  ] as const)('role: %s → %s', (text, expected) => {
    expect(role(text)).toBe(expected);
  });

  it('personName strips leading role words and stops at non-name words', () => {
    expect(personName('Plumber John Smith Plumbing')).toBe('John Smith');
    expect(personName('J.')).toBeNull();
  });
});

describe('text rules: ownership signals', () => {
  it('franchise boilerplate', () => {
    expect(findFranchise([doc('edge-franchise.html')])?.evidence).toMatch(/independently owned and operated/);
  });

  const page1 = (t: string): PageDoc[] => [{ role: 'about', source: 'website:/about/', html: t }];
  it('"independently owned and operated" counts with "locations" on the same page', () => {
    const f = findFranchise(page1('<p>All 40 locations are independently owned and operated.</p>'));
    expect(f?.evidence).toMatch(/independently owned and operated/);
  });

  it('"independently owned and operated" alone is ignored (small independents say it too)', () => {
    expect(findFranchise(page1('<p>We are a small, independently owned and operated plumbing shop.</p>'))).toBeNull();
  });

  it('the context must be on the same page', () => {
    const pages: PageDoc[] = [
      { role: 'home', source: 'website:/', html: '<p>Independently owned and operated.</p>' },
      { role: 'about', source: 'website:/about/', html: '<p>Visit our showroom location.</p>' },
    ];
    expect(findFranchise(pages)).toBeNull();
  });

  it('nonprofit wording and .gov/.edu domains', () => {
    expect(findNonprofit([doc('edge-nonprofit.html')], 'habitatrepair.org')?.evidence).toMatch(/501\(c\)\(3\)/);
    expect(findNonprofit([], 'austintexas.gov')).toMatchObject({ value: true, evidence: 'austintexas.gov' });
    expect(findNonprofit([doc('real-jdprecision-about.html')], 'jdprecisionplumbing.com')).toBeNull();
  });

  it.each([
    'We are a family-owned business',
    'Locally owned and operated',
    'Owner-operated since day one',
    'Proud to be a 3rd generation contractor',
    'A family run shop',
  ])('family-owned: %s', (t) => {
    expect(findFamilyOwned([{ role: 'about', source: 'website:/', html: `<p>${t}</p>` }])).not.toBeNull();
  });

  it('family-owned is not triggered by "family" alone', () => {
    expect(findFamilyOwned([{ role: 'about', source: 'website:/', html: '<p>Your family deserves comfort.</p>' }])).toBeNull();
  });
});

describe('contact details', () => {
  const contact = [doc('edge-contact.html', 'contact', '/contact/')];
  it('prefers an email on the company domain; skips masked, junk and image names', () => {
    expect(findEmail(contact, 'smithplumbing.test')).toMatchObject({ value: 'office@smithplumbing.test', method: 'mailto: link' });
  });

  it('extractSite picks the first phone in text when there is no tel: link', () => {
    const f = extractSite([page('edge-contact.html', 'contact', '/contact/')], 'https://smithplumbing.test/', NOW);
    expect(f.phone).toMatchObject({ value: '2145550101', method: 'text' });
    expect(f.signals.copyrightYear?.value).toBe(2024);
  });

  it('visibleText separates blocks and drops scripts', () => {
    const t = visibleText('<p>Since</p><p>1985</p><script>var x="since 1999"</script>');
    expect(t).toBe('Since\n1985');
    expect(findYearFounded([{ role: 'home', source: 'website:/', html: '<p>Since</p><p>1985</p>' }], NOW)?.value).toBe(1985);
  });
});
