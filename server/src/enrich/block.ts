/**
 * Bot-wall / CAPTCHA detection. A blocked site is recorded as `blocked` and skipped;
 * we never retry or try to get around it.
 */

// Markers that only appear on challenge / bot-wall pages (Cloudflare, DataDome, PerimeterX, Imperva, Sucuri).
const CHALLENGE_MARKERS =
  /cf-browser-verification|cdn-cgi\/challenge-platform|cf_chl_opt|cf-challenge|<title>\s*(?:just a moment|attention required)|captcha-delivery\.com|px-captcha|_incapsula_resource|sucuri website firewall/i;

// A page whose title is about proving you're human.
const CAPTCHA_TITLE = /<title>[^<]*(?:captcha|are you a (?:robot|human)|security check|verify you are human|access denied)[^<]*<\/title>/i;

export interface BlockInput {
  status: number;
  headers: Record<string, string | string[] | undefined>;
  /** First part of the body is enough; may be empty for non-HTML responses. */
  body?: string;
}

const header = (h: BlockInput['headers'], name: string) => {
  const v = h[name];
  return (Array.isArray(v) ? v.join(',') : (v ?? '')).toLowerCase();
};

/** Returns a short reason if the response is a block/CAPTCHA page, else null. */
export function detectBlock({ status, headers, body = '' }: BlockInput): string | null {
  if (status === 429) return 'HTTP 429 (rate limited)';
  if (header(headers, 'cf-mitigated') === 'challenge') return 'Cloudflare challenge';
  if (CHALLENGE_MARKERS.test(body)) return 'bot challenge page';
  if (CAPTCHA_TITLE.test(body)) return 'CAPTCHA page';
  // A plain "captcha" mention only counts on an error response: many normal pages embed
  // reCAPTCHA on their contact form, and those are not blocks.
  if (status >= 400 && /captcha/i.test(body)) return `HTTP ${status} with CAPTCHA`;
  if (status === 403) return 'HTTP 403 (forbidden)';
  return null;
}
