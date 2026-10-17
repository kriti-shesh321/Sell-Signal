export type SourceName = 'osm' | 'csv' | 'seed';
export type TradeKey = 'hvac' | 'plumbing' | 'electrical' | 'roofing';
export type Industry = TradeKey | 'other';
/** A named person is either running the business now (owner) or started it (founder). */
export type OwnerRole = 'owner' | 'founder';

/** A lead as a source adapter emits it: loosely typed, not yet cleaned. */
export interface RawLead {
  source: SourceName;
  /** The original record exactly as received (OSM tags, CSV row, seed entry). */
  raw: Record<string, unknown>;
  company?: string | null;
  website?: string | null;
  phone?: string | null;
  email?: string | null;
  street?: string | null;
  city?: string | null;
  state?: string | null;
  industry?: string | null;
  yearFounded?: string | number | null;
  ownerName?: string | null;
  ownerRole?: OwnerRole | null;
}

export interface NormalizedLead {
  source: SourceName;
  raw: Record<string, unknown>;
  company: string | null;
  domain: string | null;
  website: string | null;
  phone: string | null;
  email: string | null;
  street: string | null;
  city: string | null;
  state: string | null;
  industry: Industry | null;
  yearFounded: number | null;
  ownerName: string | null;
  ownerRole: OwnerRole | null;
  /** Company name reduced for matching (lowercase, no legal suffix or punctuation). */
  nameKey: string | null;
}

export type LeadField =
  | 'company'
  | 'domain'
  | 'website'
  | 'phone'
  | 'email'
  | 'street'
  | 'city'
  | 'state'
  | 'industry'
  | 'yearFounded'
  | 'ownerName';

export interface FieldSource {
  /** "OpenStreetMap", "CSV import", "Seed list", "website:/about-us/", "DNS" */
  source: string;
  /** How a website value was found: "JSON-LD", "microdata", "text", "tel: link", ... */
  method?: string;
  evidence?: string;
}

export interface MergedFromEntry {
  source: SourceName;
  company: string | null;
  domain: string | null;
  phone: string | null;
  matchedOn: Array<'domain' | 'phone' | 'name+city'>;
}

/** One unique company after dedupe and merge. */
export interface MergedLead extends Omit<NormalizedLead, 'source' | 'raw' | 'nameKey'> {
  /** Sources joined with '+', e.g. 'csv+seed'. */
  source: string;
  sources: SourceName[];
  raw: Array<{ source: SourceName; record: Record<string, unknown> }>;
  fieldSources: Partial<Record<LeadField, FieldSource>>;
  mergedFrom: MergedFromEntry[];
}
