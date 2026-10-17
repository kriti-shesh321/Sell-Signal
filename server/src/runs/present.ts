import { z } from 'zod';
import { topReasons } from '../score/index.js';
import type { LeadRecord } from './types.js';
import { siteStateOf } from './types.js';

export const LeadQuery = z.object({
  tier: z
    .string()
    .optional()
    .transform((v) => (v ? v.toUpperCase().split(',').map((t) => t.trim()).filter(Boolean) : []))
    .pipe(z.array(z.enum(['A', 'B', 'C']))),
  hasPhone: z.enum(['true', 'false']).optional().transform((v) => (v === undefined ? undefined : v === 'true')),
  hasOwner: z.enum(['true', 'false']).optional().transform((v) => (v === undefined ? undefined : v === 'true')),
  state: z.string().trim().toUpperCase().length(2).optional(),
  sort: z.enum(['score', '-score', 'name', '-name', 'years', '-years']).default('-score'),
});
export type LeadQuery = z.infer<typeof LeadQuery>;

/** Filters + sort shared by the results list and the exports, so an export matches what's on screen. */
export function filterLeads(leads: LeadRecord[], q: LeadQuery): LeadRecord[] {
  const out = leads.filter(
    (l) =>
      (!q.tier.length || (l.tier !== null && q.tier.includes(l.tier))) &&
      (q.hasPhone === undefined || Boolean(l.phone) === q.hasPhone) &&
      (q.hasOwner === undefined || Boolean(l.ownerName) === q.hasOwner) &&
      (!q.state || l.state === q.state),
  );
  const dir = q.sort.startsWith('-') ? -1 : 1;
  const key = q.sort.replace('-', '');
  const name = (l: LeadRecord) => (l.company ?? '').toLowerCase();
  return out.sort((a, b) => {
    let c = 0;
    if (key === 'score') c = (a.score ?? -1) - (b.score ?? -1);
    else if (key === 'years') c = (b.yearFounded ?? 9999) - (a.yearFounded ?? 9999); // older first = more years
    else c = name(a) < name(b) ? -1 : name(a) > name(b) ? 1 : 0;
    return c * dir || name(a).localeCompare(name(b));
  });
}

export const tierCounts = (leads: LeadRecord[]) => ({
  A: leads.filter((l) => l.tier === 'A').length,
  B: leads.filter((l) => l.tier === 'B').length,
  C: leads.filter((l) => l.tier === 'C').length,
});

/** API shape of one lead. */
export function toApiLead(l: LeadRecord, now: Date = new Date()) {
  return {
    id: l.id,
    company: l.company,
    domain: l.domain,
    website: l.website,
    phone: l.phone,
    email: l.email,
    street: l.street,
    city: l.city,
    state: l.state,
    industry: l.industry,
    yearFounded: l.yearFounded,
    yearsInBusiness: l.yearFounded ? now.getFullYear() - l.yearFounded : null,
    ownerName: l.ownerName,
    ownerRole: l.ownerRole,
    size: 'not estimated',
    revenue: 'not estimated',
    score: l.score,
    tier: l.tier,
    reasons: l.reasons,
    topReasons: topReasons(l.reasons),
    whyCall: l.whyCall,
    fieldSources: l.fieldSources,
    filled: l.filled,
    signals: l.signals,
    validation: l.validation,
    siteStatus: siteStateOf(l),
    completeness: { before: l.completenessBefore, after: l.completenessAfter },
    source: l.source,
    mergedFrom: l.mergedFrom,
  };
}
