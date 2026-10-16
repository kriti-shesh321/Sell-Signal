import * as cheerio from 'cheerio';

const ABOUT = /\b(about|about-us|aboutus|our-story|who-we-are|our-company|company|history|our-history|meet-the-team|our-team)\b/i;
const CONTACT = /\b(contact|contact-us|contactus|get-in-touch)\b/i;
const SKIP_EXT = /\.(pdf|jpe?g|png|gif|webp|svg|zip|docx?|xlsx?)$/i;

const sameSite = (a: URL, b: URL) => a.hostname.replace(/^www\./, '') === b.hostname.replace(/^www\./, '');

/**
 * From the homepage's links, pick at most one about-like and one contact-like page on the same site.
 * Prefers matches in the URL path, then the link text; shorter paths win.
 */
export function discoverPages(html: string, baseUrl: string): { about?: string; contact?: string } {
  const base = new URL(baseUrl);
  const $ = cheerio.load(html);
  const candidates: Array<{ url: URL; text: string }> = [];
  $('a[href]').each((_, el) => {
    const href = $(el).attr('href')?.trim();
    if (!href || href.startsWith('#') || /^(mailto|tel|javascript):/i.test(href)) return;
    let url: URL;
    try {
      url = new URL(href, base);
    } catch {
      return;
    }
    if (!/^https?:$/.test(url.protocol) || !sameSite(url, base) || SKIP_EXT.test(url.pathname)) return;
    url.hash = '';
    if (url.pathname === '/' || url.pathname === '') return;
    candidates.push({ url, text: $(el).text().replace(/\s+/g, ' ').trim() });
  });

  const pick = (re: RegExp) => {
    const byPath = candidates.filter((c) => re.test(c.url.pathname));
    const byText = candidates.filter((c) => re.test(c.text.replace(/\s+/g, '-'))); // "Who We Are" → who-we-are
    const pool = byPath.length ? byPath : byText;
    return pool.sort((a, b) => a.url.pathname.length - b.url.pathname.length)[0]?.url.href;
  };

  const about = pick(ABOUT);
  const contact = pick(CONTACT);
  return { ...(about ? { about } : {}), ...(contact && contact !== about ? { contact } : {}) };
}
