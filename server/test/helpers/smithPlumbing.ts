import type { Found, SiteSignals } from '../../src/enrich/extract/index.js';
import type { ScoringInput } from '../../src/score/index.js';
import type { Validation } from '../../src/validate/validate.js';

export const f = <T>(value: T, evidence: string, source = 'website:/'): Found<T> => ({ value, evidence, source, method: 'text' });

export const okValidation = (over: Partial<Validation> = {}): Validation => ({
  phoneValid: true,
  emailSyntax: true,
  emailDomainAcceptsMail: true,
  mxHost: 'mail.smithplumbing.com',
  stateValid: true,
  siteStatus: 'ok',
  ...over,
});

export const modernSignals = (over: Partial<SiteSignals> = {}): SiteSignals => ({
  familyOwned: null,
  franchise: null,
  nonprofit: null,
  copyrightYear: f(2026, '© 2026'),
  hasViewport: true,
  https: true,
  ...over,
});

/**
 * The worked example: family-owned since 1985, © 2019, phone + email on the site, no owner,
 * not a franchise; buy-box = plumbing + TX.
 */
export const smithPlumbing = (): ScoringInput => ({
  industry: 'plumbing',
  state: 'TX',
  phone: '2145550101',
  email: 'office@smithplumbing.com',
  yearFounded: 1985,
  ownerName: null,
  ownerRole: null,
  fieldSources: {
    yearFounded: { source: 'website:/about', evidence: '“Serving Dallas since 1985”' },
    industry: { source: 'OpenStreetMap', evidence: 'craft=plumber' },
    phone: { source: 'website:/contact' },
    email: { source: 'website:/contact' },
    state: { source: 'OpenStreetMap' },
  },
  signals: modernSignals({
    familyOwned: f(true as const, 'family-owned and operated'),
    copyrightYear: f(2019, '© 2019 Smith Plumbing'),
  }),
  siteStatus: 'ok',
  validation: okValidation(),
});

