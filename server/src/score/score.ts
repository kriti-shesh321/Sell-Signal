import type { SiteSignals } from '../enrich/extract/index.js';
import type { SiteState } from '../pipeline/applyFacts.js';
import { getTrade } from '../sources/trades.js';
import type { FieldSource, Industry, OwnerRole } from '../types.js';
import type { Validation } from '../validate/validate.js';
import type { BuyBox, WeightKey } from './buybox.js';
import { franchiseBrand } from './brands.js';

export type ReasonKey = WeightKey | 'siteIssue';

export interface Reason {
  key: ReasonKey;
  label: string;
  evidence: string;
  source: string;
  points: number;
}

export type Tier = 'A' | 'B' | 'C';

export interface ScoreResult {
  score: number;
  tier: Tier;
  /** Every fired signal, largest |points| first; 0-point flags last. */
  reasons: Reason[];
  yearsInBusiness: number | null;
  underDigitized: boolean;
  /** A franchise/PE or nonprofit signal fired: tier is capped at C. */
  notAFit: boolean;
}

/** What scoring needs to know about a lead (an EnrichedLead plus its validation). */
export interface ScoringInput {
  company?: string | null;
  industry: Industry | null;
  state: string | null;
  phone: string | null;
  email: string | null;
  yearFounded: number | null;
  ownerName: string | null;
  ownerRole: OwnerRole | null;
  fieldSources: Partial<Record<string, FieldSource>>;
  signals: SiteSignals | null;
  siteStatus: SiteState;
  validation: Validation;
}

export const tierFor = (score: number): Tier => (score >= 70 ? 'A' : score >= 45 ? 'B' : 'C');

const COPYRIGHT_CUTOFF = 2021;

export const formatPhone = (p: string) => `(${p.slice(0, 3)}) ${p.slice(3, 6)}-${p.slice(6)}`;
const sourceOf = (fs: ScoringInput['fieldSources'], field: string) => fs[field]?.source ?? 'unknown';
const evidenceOf = (fs: ScoringInput['fieldSources'], field: string, fallback: string) => fs[field]?.evidence ?? fallback;

/** Under-digitized: © ≤ 2021, or no mobile viewport, or no HTTPS. Only judged when the site was read. */
export function underDigitizedReason(signals: SiteSignals | null): { evidence: string; source: string } | null {
  if (!signals) return null;
  const parts: string[] = [];
  let source = 'website:/';
  if (signals.copyrightYear && signals.copyrightYear.value <= COPYRIGHT_CUTOFF) {
    parts.push(`© ${signals.copyrightYear.value}`);
    source = signals.copyrightYear.source;
  }
  if (!signals.hasViewport) parts.push('no mobile viewport');
  if (!signals.https) parts.push('no HTTPS');
  return parts.length ? { evidence: parts.join(', '), source } : null;
}

const SITE_ISSUE: Partial<Record<SiteState, string>> = {
  blocked: 'Website blocked automated visits',
  unreachable: 'Website unreachable',
  robots_disallowed: 'robots.txt disallows visiting the site',
};

/**
 * Acquisition Readiness Score: sum of the buy-box weights for each signal that fired, clamped
 * to 0–100. A ≥ 70, B 45–69, C < 45. Every point is a reason with its evidence and source.
 */
export function scoreLead(lead: ScoringInput, buybox: BuyBox, now: Date = new Date()): ScoreResult {
  const w = buybox.weights;
  const fs = lead.fieldSources;
  const reasons: Reason[] = [];
  const add = (key: ReasonKey, label: string, evidence: string, source: string, points: number) =>
    reasons.push({ key, label, evidence, source, points });

  const years = lead.yearFounded ? now.getFullYear() - lead.yearFounded : null;
  if (years !== null && years >= 20) {
    add('age20', `Founded ${lead.yearFounded} (${years} yrs)`, evidenceOf(fs, 'yearFounded', String(lead.yearFounded)), sourceOf(fs, 'yearFounded'), w.age20);
  } else if (years !== null && years >= 10) {
    add('age10', `Founded ${lead.yearFounded} (${years} yrs)`, evidenceOf(fs, 'yearFounded', String(lead.yearFounded)), sourceOf(fs, 'yearFounded'), w.age10);
  }

  const family = lead.signals?.familyOwned;
  if (family) add('familyOwned', 'Family-owned / owner-operated', family.evidence, family.source, w.familyOwned);

  if (lead.industry && lead.industry !== 'other' && buybox.industries.includes(lead.industry)) {
    const label = getTrade(lead.industry)?.label ?? lead.industry;
    add('industry', `${label} is in buy-box`, evidenceOf(fs, 'industry', label), sourceOf(fs, 'industry'), w.industry);
  }

  if (lead.ownerName) {
    const label = `${lead.ownerRole === 'founder' ? 'Founder' : 'Owner'}: ${lead.ownerName}`;
    add('owner', label, evidenceOf(fs, 'ownerName', lead.ownerName), sourceOf(fs, 'ownerName'), w.owner);
  }

  if (lead.phone && lead.validation.phoneValid) {
    add('phone', 'Valid phone', formatPhone(lead.phone), sourceOf(fs, 'phone'), w.phone);
  }
  if (lead.email && lead.validation.emailDomainAcceptsMail) {
    add('emailDomain', 'Domain accepts email', `${lead.email} (MX: ${lead.validation.mxHost})`, 'DNS', w.emailDomain);
  }

  const dated = underDigitizedReason(lead.signals);
  if (dated) add('underDigitized', 'Dated website', dated.evidence, dated.source, w.underDigitized);

  if (lead.state && buybox.states.includes(lead.state)) {
    add('state', `${lead.state} is in buy-box`, lead.state, sourceOf(fs, 'state'), w.state);
  }

  const franchise = lead.signals?.franchise;
  const brand = franchiseBrand(lead.company);
  if (franchise) add('franchise', 'Franchise / subsidiary / PE-owned', franchise.evidence, franchise.source, w.franchise);
  else if (brand) add('franchise', 'Franchise / subsidiary / PE-owned', `name matches a known franchise brand (${brand})`, 'brand list', w.franchise);
  const nonprofit = lead.signals?.nonprofit;
  if (nonprofit) add('nonprofit', 'Nonprofit / public', nonprofit.evidence, nonprofit.source, w.nonprofit);

  const issue = SITE_ISSUE[lead.siteStatus];
  if (issue) add('siteIssue', issue, lead.siteStatus, 'crawler', 0);

  const raw = reasons.reduce((sum, r) => sum + r.points, 0);
  const score = Math.max(0, Math.min(100, raw));
  reasons.sort((a, b) => Math.abs(b.points) - Math.abs(a.points));
  // Already owned (franchise/PE) or not for sale (nonprofit/public): never a call-first lead, whatever the points.
  const notAFit = reasons.some((r) => r.key === 'franchise' || r.key === 'nonprofit');
  return { score, tier: notAFit ? 'C' : tierFor(score), reasons, yearsInBusiness: years, underDigitized: dated !== null, notAFit };
}

/** The chips shown in the table: top 3 by |points|, flags excluded. */
export const topReasons = (reasons: Reason[], n = 3) => reasons.filter((r) => r.points !== 0).slice(0, n);
