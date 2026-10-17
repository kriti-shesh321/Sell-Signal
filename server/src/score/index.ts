import type { EnrichedLead } from '../pipeline/applyFacts.js';
import type { Validation } from '../validate/validate.js';
import type { BuyBox } from './buybox.js';
import { scoreLead, type ScoreResult } from './score.js';
import { whyCall } from './whyCall.js';

export * from './buybox.js';
export * from './score.js';
export { whyCall, shortName } from './whyCall.js';

export interface ScoredLead extends ScoreResult {
  whyCall: string;
}

/** Score an enriched, validated lead and write its why-call line. Pure: rescoring needs no refetch. */
export function scoreEnriched(lead: EnrichedLead, validation: Validation, buybox: BuyBox, now: Date = new Date()): ScoredLead {
  const result = scoreLead({ ...lead, validation }, buybox, now);
  const line = whyCall(
    {
      yearFounded: lead.yearFounded,
      ownerName: lead.ownerName,
      ownerRole: lead.ownerRole,
      state: lead.state,
      industry: lead.industry,
      familyOwned: Boolean(lead.signals?.familyOwned),
      franchise: Boolean(lead.signals?.franchise),
      nonprofit: Boolean(lead.signals?.nonprofit),
    },
    result,
  );
  return { ...result, whyCall: line };
}
