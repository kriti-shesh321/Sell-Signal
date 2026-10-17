import { formatPhone, topReasons } from '../score/index.js';
import { getTrade } from '../sources/trades.js';
import type { LeadRecord } from '../runs/types.js';
import { siteStateOf } from '../runs/types.js';
import { toCsv } from './csv.js';

export type ExportFormat = 'csv' | 'callsheet' | 'hubspot';

export const EXPORT_FILES: Record<ExportFormat, string> = {
  csv: 'sellsignal-leads.csv',
  callsheet: 'sellsignal-callsheet.csv',
  hubspot: 'sellsignal-hubspot.csv',
};

const yesNo = (v: boolean | null | undefined) => (v === null || v === undefined ? '' : v ? 'yes' : 'no');
const phoneOut = (p: string | null) => (p ? formatPhone(p) : '');
const tradeLabel = (l: LeadRecord) => (l.industry && l.industry !== 'other' ? (getTrade(l.industry)?.label ?? l.industry) : (l.industry ?? ''));
const years = (l: LeadRecord, now: Date) => (l.yearFounded ? now.getFullYear() - l.yearFounded : '');
const reasonText = (l: LeadRecord) =>
  topReasons(l.reasons)
    .map((r) => `${r.label} (${r.points > 0 ? '+' : ''}${r.points})`)
    .join('; ');

export const CSV_HEADER = [
  'company', 'website', 'domain', 'phone', 'phone_valid', 'email', 'email_domain_accepts_mail', 'street', 'city', 'state',
  'industry', 'year_founded', 'years_in_business', 'owner_name', 'owner_role', 'family_owned', 'franchise_or_pe', 'nonprofit',
  'size', 'revenue', 'score', 'tier', 'top_reasons', 'why_call', 'site_status', 'sources', 'merged_from',
  'completeness_before', 'completeness_after',
];

/** Full cleaned, enriched, scored list. */
export function fullCsv(leads: LeadRecord[], now: Date): string {
  return toCsv(
    CSV_HEADER,
    leads.map((l) => [
      l.company, l.website, l.domain, phoneOut(l.phone), yesNo(l.validation?.phoneValid), l.email,
      yesNo(l.validation?.emailDomainAcceptsMail), l.street, l.city, l.state, tradeLabel(l), l.yearFounded, years(l, now),
      l.ownerName, l.ownerRole, yesNo(l.signals ? Boolean(l.signals.familyOwned) : null),
      yesNo(l.signals ? Boolean(l.signals.franchise) : null), yesNo(l.signals ? Boolean(l.signals.nonprofit) : null),
      'not estimated', 'not estimated', l.score, l.tier, reasonText(l), l.whyCall, siteStateOf(l), l.source,
      l.mergedFrom.map((m) => `${m.source}: ${m.company ?? m.domain ?? ''}`).join('; '), l.completenessBefore, l.completenessAfter,
    ]),
  );
}

export const CALLSHEET_HEADER = ['rank', 'tier', 'score', 'company', 'phone', 'owner_name', 'city', 'state', 'why_call', 'outcome', 'notes', 'follow_up_date'];

/** For a calling session: tiers A + B only, best first, with empty columns for the caller. */
export function callSheet(leads: LeadRecord[]): string {
  const rows = leads
    .filter((l) => l.tier === 'A' || l.tier === 'B')
    .sort((a, b) => (b.score ?? 0) - (a.score ?? 0))
    .map((l, i) => [
      i + 1, l.tier, l.score, l.company, phoneOut(l.phone),
      l.ownerName ? (l.ownerRole === 'founder' ? `${l.ownerName} (founder)` : l.ownerName) : 'ask for owner',
      l.city, l.state, l.whyCall, '', '', '',
    ]);
  return toCsv(CALLSHEET_HEADER, rows);
}

/**
 * HubSpot company import: column names are HubSpot's default Company property labels, so the
 * import maps them without manual work. Industry is a HubSpot dropdown, so trades map to its
 * "Construction" option and the trade goes in the description.
 */
export const HUBSPOT_HEADER = [
  'Company name', 'Company domain name', 'Website URL', 'Phone number', 'Street address', 'City', 'State/Region',
  'Industry', 'Year founded', 'Description',
];

export function hubspotCsv(leads: LeadRecord[]): string {
  return toCsv(
    HUBSPOT_HEADER,
    leads.map((l) => [
      l.company, l.domain, l.website, phoneOut(l.phone), l.street, l.city, l.state,
      l.industry && l.industry !== 'other' ? 'Construction' : '', l.yearFounded,
      [`SellSignal ${l.tier ?? '-'} ${l.score ?? ''}`.trim(), tradeLabel(l), l.whyCall].filter(Boolean).join(' · '),
    ]),
  );
}

/** Rows that will be in the file (the call sheet keeps A + B only). */
export function exportRowCount(format: ExportFormat, leads: LeadRecord[]): number {
  return format === 'callsheet' ? leads.filter((l) => l.tier === 'A' || l.tier === 'B').length : leads.length;
}

export function renderExport(format: ExportFormat, leads: LeadRecord[], now: Date): string {
  return format === 'csv' ? fullCsv(leads, now) : format === 'callsheet' ? callSheet(leads) : hubspotCsv(leads);
}
