import { getTrade } from '../sources/trades.js';
import type { Industry, OwnerRole } from '../types.js';
import type { ScoreResult } from './score.js';

export interface WhyCallInput {
  yearFounded: number | null;
  ownerName: string | null;
  ownerRole: OwnerRole | null;
  state: string | null;
  industry: Industry | null;
  familyOwned: boolean;
  franchise: boolean;
  nonprofit: boolean;
}

/** "Jerry David" → "J. David", "George F. Saliba" → "G. Saliba". */
export function shortName(name: string): string {
  const parts = name.split(/\s+/).filter(Boolean);
  if (parts.length < 2) return name;
  return `${parts[0]![0]}. ${parts[parts.length - 1]}`;
}

const tradeWord = (industry: Industry | null) => {
  if (!industry || industry === 'other') return null;
  return industry === 'hvac' ? 'HVAC' : (getTrade(industry)?.label.toLowerCase() ?? industry);
};

/**
 * One line telling a caller why this lead and how to open: a template over the signals that
 * fired (no LLM), e.g. "Family-owned since 1985 (41 yrs) · TX plumbing · dated website →
 * succession + modernization angle. Owner not listed: ask for the owner."
 */
export function whyCall(lead: WhyCallInput, result: Pick<ScoreResult, 'yearsInBusiness' | 'underDigitized'>): string {
  if (lead.franchise || lead.nonprofit) {
    return `Likely not a fit: ${lead.franchise ? 'franchise/PE-owned' : 'nonprofit/public'}.`;
  }
  const years = result.yearsInBusiness;
  const fragments: string[] = [];
  if (lead.yearFounded && years !== null) {
    fragments.push(`${lead.familyOwned ? 'Family-owned since' : 'Est.'} ${lead.yearFounded} (${years} yrs)`);
  } else if (lead.familyOwned) {
    fragments.push('Family-owned');
  }
  if (lead.ownerName && lead.ownerRole === 'founder') {
    // A founder may have retired or sold: point the caller at whoever runs it today.
    const year = lead.yearFounded ? ` (${lead.yearFounded})` : '';
    fragments.push(`founded by ${shortName(lead.ownerName)}${year}: ask for the current owner`);
  } else if (lead.ownerName) {
    fragments.push(`owner ${shortName(lead.ownerName)}`);
  }
  const trade = tradeWord(lead.industry);
  const place = [lead.state, trade].filter(Boolean).join(' ');
  if (place) fragments.push(place);
  if (result.underDigitized) fragments.push('dated website');

  const askOwner = lead.ownerName ? '' : ' Owner not listed: ask for the owner.';
  const hasSignal = Boolean(lead.yearFounded || lead.familyOwned || lead.ownerName || result.underDigitized);
  if (!hasSignal) return 'Limited public info: verify basics on the call.';

  const angles: string[] = [];
  if ((years !== null && years >= 20) || lead.familyOwned) angles.push('succession');
  if (result.underDigitized) angles.push('modernization');
  const angle = angles.length ? ` → ${angles.join(' + ')} angle` : '';
  return `${fragments.join(' · ')}${angle}.${askOwner}`;
}
