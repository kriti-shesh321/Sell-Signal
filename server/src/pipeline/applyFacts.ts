import type { SiteStatus } from '../enrich/cache.js';
import type { AiFacts } from '../enrich/ai/index.js';
import type { Found, SiteFacts, SiteSignals } from '../enrich/extract/index.js';
import type { LeadField, MergedLead } from '../types.js';

export type SiteState = SiteStatus | 'no_website';

/** A merged lead after its website was read: gaps filled, signals attached. */
export interface EnrichedLead extends MergedLead {
  signals: SiteSignals | null;
  siteStatus: SiteState;
  /** Fields that were empty before enrichment and filled from the website. */
  filled: LeadField[];
}

/**
 * Fill only the lead's empty fields from the website's facts (source data is never overwritten),
 * recording page + method + evidence for each filled value.
 */
export function applySiteFacts(lead: MergedLead, site: { status: SiteStatus; facts: SiteFacts | null } | null): EnrichedLead {
  const out: EnrichedLead = {
    ...lead,
    fieldSources: { ...lead.fieldSources },
    signals: site?.facts?.signals ?? null,
    siteStatus: site ? site.status : 'no_website',
    filled: [],
  };
  const facts = site?.facts;
  if (!facts) return out;

  const fill = <K extends LeadField>(field: K, value: MergedLead[K] | null | undefined, from: Found<unknown>) => {
    if (out[field] !== null || value === null || value === undefined) return;
    (out as unknown as Record<LeadField, unknown>)[field] = value;
    out.fieldSources[field] = { source: from.source, method: from.method, evidence: from.evidence };
    out.filled.push(field);
  };

  if (facts.yearFounded) fill('yearFounded', facts.yearFounded.value, facts.yearFounded);
  if (facts.ownerName) {
    fill('ownerName', facts.ownerName.value, facts.ownerName);
    if (out.filled.includes('ownerName')) out.ownerRole = facts.ownerName.role;
  }
  if (facts.phone) fill('phone', facts.phone.value, facts.phone);
  if (facts.email) fill('email', facts.email.value, facts.email);
  if (facts.address) {
    fill('street', facts.address.value.street, facts.address);
    fill('city', facts.address.value.city, facts.address);
    fill('state', facts.address.value.state, facts.address);
  }
  return out;
}

/**
 * Fill what the rules left empty with grounded AI facts (owner, founding year, family-owned).
 * Returns the names of the facts it filled.
 */
export function applyAiFacts(lead: EnrichedLead, ai: AiFacts): Array<'ownerName' | 'yearFounded' | 'familyOwned'> {
  const done: Array<'ownerName' | 'yearFounded' | 'familyOwned'> = [];
  const record = (field: 'ownerName' | 'yearFounded', from: Found<unknown>) => {
    lead.fieldSources[field] = { source: from.source, method: from.method, evidence: from.evidence };
    lead.filled.push(field);
    done.push(field);
  };
  if (lead.ownerName === null && ai.ownerName) {
    lead.ownerName = ai.ownerName.value;
    lead.ownerRole = ai.ownerName.role;
    record('ownerName', ai.ownerName);
  }
  if (lead.yearFounded === null && ai.yearFounded) {
    lead.yearFounded = ai.yearFounded.value;
    record('yearFounded', ai.yearFounded);
  }
  if (lead.signals && !lead.signals.familyOwned && ai.familyOwned) {
    lead.signals = { ...lead.signals, familyOwned: ai.familyOwned };
    done.push('familyOwned');
  }
  return done;
}
