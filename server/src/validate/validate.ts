import { resolveMx } from 'node:dns/promises';
import { isStateCode } from '../sources/states.js';
import type { SiteState } from '../pipeline/applyFacts.js';

export interface Validation {
  /** null when there's no phone to check */
  phoneValid: boolean | null;
  emailSyntax: boolean | null;
  /** The email's domain has MX records: it can receive mail. Not proof the inbox exists. */
  emailDomainAcceptsMail: boolean | null;
  mxHost: string | null;
  stateValid: boolean | null;
  siteStatus: SiteState;
}

/**
 * US number per NANP: 10 digits; area code and exchange start with 2–9 and aren't N11 service codes
 * (211, 311, …, 911).
 */
export function isValidUsPhone(phone: string | null): boolean {
  if (!phone || !/^[2-9]\d{2}[2-9]\d{6}$/.test(phone)) return false;
  return phone.slice(1, 3) !== '11' && phone.slice(4, 6) !== '11';
}

export const isValidEmailSyntax = (email: string | null) =>
  !!email && /^[a-z0-9._%+'-]+@[a-z0-9-]+(?:\.[a-z0-9-]+)*\.[a-z]{2,}$/i.test(email);

export type MxLookup = (domain: string) => Promise<string | null>;

/**
 * MX lookup with a timeout (a slow resolver counts as "no"), memoized per domain for the run.
 * A null MX (RFC 7505, exchange ".") means the domain explicitly accepts no mail.
 */
export function mxLookup(
  resolve: (domain: string) => Promise<Array<{ exchange: string; priority: number }>> = resolveMx,
  timeoutMs = 3000,
): MxLookup {
  const memo = new Map<string, Promise<string | null>>();
  return (domain) => {
    const key = domain.toLowerCase();
    let p = memo.get(key);
    if (!p) {
      p = new Promise<string | null>((done) => {
        const timer = setTimeout(() => done(null), timeoutMs);
        resolve(key)
          .then((records) => {
            const best = [...records].sort((a, b) => a.priority - b.priority).find((r) => r.exchange && r.exchange !== '.');
            done(best?.exchange ?? null);
          })
          .catch(() => done(null))
          .finally(() => clearTimeout(timer));
      });
      memo.set(key, p);
    }
    return p;
  };
}

export async function validateLead(
  lead: { phone: string | null; email: string | null; state: string | null; siteStatus: SiteState },
  mx: MxLookup,
): Promise<Validation> {
  const emailSyntax = lead.email ? isValidEmailSyntax(lead.email) : null;
  const mxHost = lead.email && emailSyntax ? await mx(lead.email.split('@')[1]!) : null;
  return {
    phoneValid: lead.phone ? isValidUsPhone(lead.phone) : null,
    emailSyntax,
    emailDomainAcceptsMail: lead.email && emailSyntax ? mxHost !== null : null,
    mxHost,
    stateValid: lead.state ? isStateCode(lead.state) : null,
    siteStatus: lead.siteStatus,
  };
}
